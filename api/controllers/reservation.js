'use strict';
const _                 = require('lodash');
const mongoHelper       = require('../helpers/mongoHelper');
const randomstring      = require('randomstring');
const users             = require('./user');
const flights           = require('./flight');
var mongoose = require('mongoose');
var fetch = require("node-fetch");
mongoose.connect('mongodb://localhost:27017/myapp' , function(err){
    if(err) throw err;
    console.log("succesfully connected");
});


function reservation(req, res) {
    var recordLocator = _.get(req, "swagger.params.recordLocator.value");
    if (recordLocator != null && recordLocator != "") {
        let reservation = retrieveReservation(recordLocator).then(function(reservation) {
            if (reservation != null && _.get(reservation, "err") == null) {
                hydrateReservationResponse(reservation).then(function(hydratedReservation) {
                    res.json(hydratedReservation);
                    return;
                }).catch(function(err) {
                    res.status(500).json({"error": "Reservation retrieval failed", "err": err});
                });
            } else {
                res.status(500).json({"error": "Reservation could not be found"});
            }
        });
    } else {
        res.status(500).json({"error": "Reservation could not be found"});
    }
}


function createReservation(req, res) {
    var record = {};
    record.userId = _.get(req, "swagger.params.userId.value");
    record.flightIds = _.get(req, "swagger.params.flightIds.value");
    record.recordLocator = createRecordLocator();

    if(record.userId && record.flightIds && record.flightIds.length > 0) {
        let reservations = mongoHelper.getDb().collection("reservation");
        try {
            reservations.insertOne(record, function(err, response) {
                let reservation = _.get(response, "ops[0]");
                if (err || !reservation) {
                    res.status(400).json({"error": "Reservation could not be created", "reason": err});
                    console.log(err);
                    return;
                };
                res.json(reservation);
            });
        } catch(err) {
            res.status(400).json({"error": "Something went wrong creating user"});
        }
    } else {
        res.status(400).json({"error": "User could not be created; required fields missing"});
    }
}


function createRecordLocator() {
    var attempts = 0;
    while (attempts < 10) {
        let recordLocator = _.toUpper(randomstring.generate({
            "length": 6,
            "charset": "alphabetic"
        }));
        return recordLocator;
        //TODO: Fix this so we ensure uniqueness
       // if (!retrieveReservation(recordLocator)) {
       //     return recordLocator;
       // }
       attempts += 1;
    }
}

function retrieveReservation(recordLocator) {
    let reservations = mongoHelper.getDb().collection("reservation");
    
    return new Promise(function(resolve, reject) {
        try {
            reservations.findOne({'recordLocator': recordLocator}, function(err, reservation) {
                if (err) {
                    console.log(err);
                    resolve({"err": err});
                    return;
                } else if (!reservation) {
                    resolve(null);
                    return;
                };
                resolve(reservation);
            });
        } catch(err) {
            console.log(err);
            reject({"err": err});
        }
    });
}


function getFlightLanded(){
    let reserve;
    let reservations = mongoHelper.getDb().collection("reservation");
    var names = ['Lalo', 'Ricardo', 'Amble'];

    for(var j = 0; j<names.length; j++){
        let reservation = retrieveReservation(names[j]).then(function(reservation) {
            if (reservation != null && _.get(reservation, "err") == null) {
                hydrateReservationResponse(reservation).then(function(hydratedReservation){
                    reserve = hydratedReservation;
                    for (var i = 0; i < reserve.flights.length; i++){
                        var currTime = Date.now();
                        var landTime = new Date(reserve.flights[i].arrivalTime);
                        if (currTime > landTime.getTime() && reserve.flights[i].hasLanded === "0"){
            
            
                            var name = reserve.recordLocator;
                            console.log(name);
                            var airport = reserve.flights[i].origin;
                            console.log(airport);
                            var data = {firstName: name, airportCode: airport };
                            var url = 'http://e9e8e304.ngrok.io/send';
            
                          
            
                            var flightId = mongoose.Types.ObjectId(reserve.flights[i]._id);
                            var myquery = { '_id' : flightId };
                            var newVal = { $set : { 'hasLanded' : '1' } };
                            let flights = mongoHelper.getDb().collection("flight");
                            flights.updateOne(myquery, newVal, function(err, res) {
                                if (err){
                                    console.log("error updating db");
                                }
                                else {
                                    console.log(res.result);
                                    console.log("hasLanded updated");
                                }
            
                            });
                            console.log(reserve.flights[i]._id);
                            console.log(data);
                            fetch(url, {
                                method: 'POST', // or 'PUT'
                                body: JSON.stringify(data), // data can be `string` or {object}!
                                headers:{
                                  'Content-Type': 'application/json'
                                }
                              }).then(res => res.json())
                              .then(response => console.log('Success:', JSON.stringify(response)))
                              .catch(error => console.error('Error:', error));
                        }   
                    }
                    
                });
            }
        });
      
    }
}

setInterval(getFlightLanded, 1500);

function isLanded(req, res){
    
    var recordLocator = _.get(req, "swagger.params.firstName.value");
    if (recordLocator != null && recordLocator != "") {
        let reservation = retrieveReservation(recordLocator).then(function(reservation) {
            if (reservation != null && _.get(reservation, "err") == null) {
                hydrateReservationResponse(reservation).then(function(hydratedReservation) {
                    var flightId = setInterval( function() { getFlightLanded(hydratedReservation)} , 1500);
                    //res.json(flightId);
                    if (flightId !== -1){
                        return;
                    }
                }).catch(function(err) {
                    res.status(500).json({"error": "Reservation retrieval failed", "err": err});
                });
            } else {
                res.status(500).json({"error": "Reservation could not be found"});
            }
        });
    } else {
        res.status(500).json({"error": "Reservation could not be found"});
    }

    
}



function hydrateReservationResponse(reservation) {
    return new Promise(function(resolve, reject) {
        let promises = [];
        try {
            let userPromise = users.retrieveUser(reservation.userId).then(function(userData) {
                reservation.user = userData;
            });
            promises.push(userPromise);

            let flightsPromise = flights.retrieveFlights(reservation.flightIds).then(function(flightsData) {
                reservation.flights = flightsData;
            });
            promises.push(flightsPromise);

            Promise.all(promises).then(function() {
                delete(reservation.userId);
                delete(reservation.flightIds);
                resolve(reservation);
            }).catch(function(err) {
                reject(err);
            });
        } catch(err) {
            console.log(err);
            reject(err);
        }
    });
}
