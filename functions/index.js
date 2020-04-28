'use strict';

const http = require('http');
const https = require('https');
const functions = require('firebase-functions');
const {WebhookClient, Card, Payload} = require('dialogflow-fulfillment');

const host = 'api.openweathermap.org';
const ApiKey = '<INSERT YOUR OWM API KEY HERE>';
const hostWiki = 'https://sv.wikipedia.org/w/api.php?';
const hostResrobot = 'https://api.resrobot.se/v2/trip?';
const locationHost = 'https://api.resrobot.se/v2/location.name?';
const apiKeyResrobot = '<INSERT YOUR RESROBOT API KEY HERE>';

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((req, res) => {
  const agent = new WebhookClient({ request: req, response: res});


  // Call the weather API
  function weatherApiCall(agent){
      // Get the city and date from the request
    var city = agent.parameters['geo-city']; // city is a required parameter
    console.log('city: ' + city);
    // Get the date for the weather forecast (if present)
    var date = '';
    if (agent.parameters.date) {
      date = agent.parameters.date;
      console.log('Date: ' + date);
    }
    return callWeatherApi(city, date).then((output) => {
      agent.add(output); //message
    }).catch(() => {
      agent.add('Sorry, I cannot give you information about the weather');
    });
  }
  
   // Call the wiki API
  function wikiApiCall(agent){
    // Get the city and date from the request
    var wikisearchterm = agent.parameters.wikisearchterm;
    console.log('search term: ' + wikisearchterm);
    
    return callWikipediaApi(wikisearchterm).then((output) => {
      let imageUrl = 'https://upload.wikimedia.org/wikipedia/en/thumb/8/80/Wikipedia-logo-v2.svg/1122px-Wikipedia-logo-v2.svg.png';
      if(output[3] != ''){
      	imageUrl = output[3];
      }
      agent.add(`Hmm... let me check what we have on ${wikisearchterm}`);
      agent.add(`Here you go:`);
      agent.add(new Card({
        title: output[1],
      	text: output[0],
        imageUrl: imageUrl,
      	buttonText: "Read more about " + output[1],
        buttonUrl: output[2]
      })); //message
    }).catch(() => {
      agent.add('I cannot find anything!');
    });
  }
  
  function traktamenteHandler(agent){
    //Get country
    var country = agent.parameters['geo-country']; // city is a required parameter
    console.log('country: ' + country);
   
    if(country.toLowerCase() == 'sverige'){
    	agent.add('Unfortunately, domestic indemnity is not issued'); //message
    }else{
      	agent.add(new Card({
          	title: 'Utlandstraktamenten',
            text: 'Read more about domestic indemnity for ' + country + ' here',
            imageUrl: 'https://skatteverket.se/images/18.5d699354142b230302014c/1385975660374/SkatteverketLogo.png',
            buttonText: 'Läs mer om traktamenten',
            buttonUrl: 'https://skatteverket.se/privat/skatter/arbeteochinkomst/traktamente/utlandstraktamente.4.2b543913a42158acf800016035.html'
        }));
    }
  }

     // Call the wiki API
    function trafiklabApiCall(agent){
    // Get the parameters from the request
    var origin = agent.parameters.origin;
    var destin = agent.parameters.destin;

    var time = '';
    if (agent.parameters.time) {
        time = agent.parameters.time;
    }
    
    //Print to console
    console.log('Origin: ' + origin + '\nDestination: ' + destin + '\nTime: ' + time);
    
    return callTrafiklabApi(origin, destin, time).then((output) => {
        agent.add(new Payload("PLATFORM_UNSPECIFIED", [{
        "message": output +'\n\n<i>Did you get help?</i>',
        "platform": "kommunicate",
        "messageType": "html",
        "metadata": {
            "contentType": "300",
            "templateId": "6",
            "payload": [
            {
                "title": "Yes",
                "message": "Yes"
            },{
                "title": "No",
                "message": "No"
            }
            ]
        }
        }])); //message
    }).catch(() => {
        agent.add('Unfortunately, I cannot find anything');
    });
    }

  let intentMap = new Map();
  intentMap.set('Lokaltrafik-intent', trafiklabApiCall);
  intentMap.set('Väder-intent', weatherApiCall);
  intentMap.set('Wiki-intent', wikiApiCall);
  intentMap.set('Traktamente-i-land-intent', traktamenteHandler);
  agent.handleRequest(intentMap);
});

function callWeatherApi (city, date) {
  return new Promise((resolve, reject) => {
    // Create the path for the HTTP request to get the weather
    let path = '/data/2.5/weather?q='+
    encodeURIComponent(city) + '&APPID=' + ApiKey + '&lang=sv&units=metric';
    console.log('API Request: ' + host + path);
	
    // Make the HTTP request to get the weather
    http.get({host: host, path: path}, (res) => {
      let body = ''; // var to store the response chunks
      res.on('data', (d) => { body += d; }); // store each response chunk
      res.on('end', () => {
        // After all the data has been received parse the JSON for desired data
        let response = JSON.parse(body);
        console.log('API Response: ' + body);
        let forecast = response.weather[0].description;
        let weatherIcon = response.weather[0].icon;
        let cityName = response.name;
        let country = response.sys.country;
        let minTemp = response.main.temp_min;
        let maxTemp = response.main.temp_max;
        let temp = response.main.temp;
        
        let tempString = '';
		if(Math.abs(maxTemp - minTemp) < 1){
          tempString = Math.round(temp) + '°C';
        }else{
        	tempString = 'between ' + Math.round(minTemp) + '°C and ' + Math.round(maxTemp) + '°C';
        }
		
        // Create response
        let output = 	'Right now in ' + cityName + ', ' + country + ' the weather is ' + forecast + 
            					' with a temperature between ' + tempString + getWeatherEmoji(weatherIcon);
        //let output = [responseMessage, weatherIconUrl];
        // Resolve the promise with the output text
        console.log(output);
        resolve(output);
      });
      res.on('error', (error) => {
        console.log(`Error calling the weather API: ${error}`);
        reject();
      });
    });
  });
}

function callWikipediaApi(searchTerm, format = "json", action = "query", prop = "extracts", limit = 1, list = "search") {
    return new Promise((resolve, reject) => {
      	//let pageId = getWikiPageId(searchTerm).then((output) => {pageId = output;});
      	//let pageId = '';
      	getWikiPageId(searchTerm).then( (pageId) => {
          getWikiImageUrl(pageId).then( (imageUrl) => {
            let url = `${hostWiki}&format=${format}&action=${action}&prop=${prop}&exintro=&explaintext=&pageids=${pageId}`;
            https.get(url, (res) => {
                let body = '';
                res.on('data', (d) => body += d);
                res.on('end', () => {
                    let response = JSON.parse(body);
                    console.log('API Response: ' + body);
                    let extract = response.query.pages[pageId].extract;
                    let title = response.query.pages[pageId].title;
                    let wikiUrl = "https://sv.wikipedia.org/?curid=" + pageId;
                    let output = [getSnippet(extract, 30), title, wikiUrl, imageUrl];
                    resolve(output);
                });
                res.on('error', (error) => {
                    console.log(`Error calling the wiki API: ${error}`);
                    reject(error);
                });
              });
        });
      });
   });
}

function callTrafiklabApi(origin, destin, time, format = "json") {
    return new Promise((resolve, reject) => {
      	getLocationId(origin).then( (originId) => {
          getLocationId(destin).then( (destId) => {
            let url = `${hostResrobot}&format=${format}&key=${apiKeyResrobot}&originId=${originId}&destId=${destId}&time=${time}`;
            console.log('API call planning: ' + url);
            https.get(url, (res) => {
                let body = '';
                res.on('data', (d) => body += d);
                res.on('end', () => {
                    let response = JSON.parse(body);
                    console.log('API Response planning: ' + body);

                    let output = '';
                    let legs = response.Trip[0].LegList.Leg;
                    for (var i = 0; i < legs.length; i++){
                        let originName = response.Trip[0].LegList.Leg[i].Origin.name;
                        let originTime = response.Trip[0].LegList.Leg[i].Origin.time;
                        let destName = response.Trip[0].LegList.Leg[i].Destination.name;
                        let destTime = response.Trip[0].LegList.Leg[i].Destination.time;
                        if(response.Trip[0].LegList.Leg[i].type == 'WALK'){
                            let distance = response.Trip[0].LegList.Leg[i].dist;
                            output = output + '<i>Gå ' + distance + ' meter:</i>\n';
                        }else{
                            let operatorType = response.Trip[0].LegList.Leg[i].Product.operator;
                            let transportType = response.Trip[0].LegList.Leg[i].Product.catCode;
                            let direction = response.Trip[0].LegList.Leg[i].direction;
                            output = output + '<i>Ta ' + operatorType + ' ' + getTransportType(transportType) + ' mot ' + direction + ':</i>\n';
                        }
                        
                        output = output + `<b>${originTime.substring(0, 5)}:</b> ${originName}\n<b>${destTime.substring(0, 5)}:</b> ${destName}`;
                        if(i != (legs.length-1)){
                            output = output + '\n\n';
                        }
                    }
                  	console.log(output);
                    resolve(output);
                });
                res.on('error', (error) => {
                    console.log(`Error calling the wiki API: ${error}`);
                    reject(error);
                });
              });
        });
      });
   });
}

function getWikiPageId(searchTerm, format = "json", action = "query", list = "search", limit = 1) {
    return new Promise((resolve, reject) => {
      	let url = `${hostWiki}&format=${format}&action=${action}&list=${list}&srlimit=${limit}&srsearch=${searchTerm}`;
        https.get(url, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                let response = JSON.parse(body);
              	console.log('API Response get page Id: ' + body);
              	let output = response.query.search[0].pageid;
				console.log('page id: ' + output);
                resolve(output);
            });
            res.on('error', (error) => {
              	console.log(`Error calling the wiki API: ${error}`);
                reject(error);
            });
        });
    });
}

//Returns Url from wiki-page
function getWikiImageUrl(pageId, format = "json", action = "query", prop = "pageimages", pithumbsize = 500) {
    return new Promise((resolve, reject) => {
      	let url = `${hostWiki}&format=${format}&action=${action}&prop=${prop}&pithumbsize=${pithumbsize}&pageids=${pageId}`;
        https.get(url, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                let response = JSON.parse(body);
              	console.log('API Response get Image URL: ' + body);
              	let output = '';
              	try{
              		output = response.query.pages[pageId].thumbnail.source;
                }catch(error){
                  	output = '';
                	console.log('image url: ' + output);
                	resolve(output);
                }
				console.log('image url: ' + output);
                resolve(output);
            });
            res.on('error', (error) => {
              	console.log(`Error calling the wiki API: ${error}`);
                reject(error);
            });
        });
    });
}

//Gives location Id based on string input
function getLocationId(location, format = "json") {
    return new Promise((resolve, reject) => {
        let url = `${locationHost}&format=${format}&key=${apiKeyResrobot}&input=${encodeURIComponent(location)}`;
        https.get(url, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                let response = JSON.parse(body);
              	console.log('API Response get location Id: ' + body);
                let StopLocationArray = response.StopLocation;
              	console.log('StopLocation length ' + StopLocationArray.length);
                /*for(var i = 0; i < StopLocationArray.length; i++){
                    console.log('StopLocation[' + i + ']' + StopLocationArray[i]);
                }*/
                resolve(response.StopLocation[0].id);
            });
            res.on('error', (error) => {
              	console.log(`Error calling the wiki API: ${error}`);
                reject(error);
            });
        });
    });
}

function getSnippet(str, len) {
  if (str.length > len) {
    var i = str.indexOf(".", len);
    return str.substring(0, i);
  }
  return str;
}

function getWeatherEmoji (icon) {
	switch(icon){
      case '01d': return ' ☀️';
      case '02d': return ' 🌤️';
      case '03d': return ' ☁️';
      case '04d': return ' ☁️';
      case '09d': return ' 🌧️';
      case '10d': return ' 🌦️';
      case '11d': return ' 🌩️';
      case '13d': return ' ❄️';
      case '50d': return ' 🌫️';
      case '01n': return ' 🌑';
      case '02n': return ' ☁️';
      case '03n': return ' ☁️';
      case '04n': return ' ☁️';
      case '09n': return ' 🌧️';
      case '10n': return ' 🌧️';
      case '11n': return ' 🌩️';
      case '13n': return ' ❄️';
      case '50n': return ' 🌫️';
      default: return '';
    }
}

function getTransportType(transportCode){
    switch(transportCode){
        case '1': return 'Snabbtåg';
        case '2': return 'Regional';
        case '3': return 'Expressbuss';
        case '4': return 'Tåg';
        case '5': return 'Tunnelbana';
        case '6': return 'Spårvagn';
        case '7': return 'Buss';
        case '8': return 'Färja';
        case '9': return 'Taxi';
        default: return '';
    }
}