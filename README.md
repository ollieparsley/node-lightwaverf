node-lightwaverf
================

A NodeJS library for controlling devices using the LightwaveRF Wi-Fi Link

## Installation

    npm install lightwaverf

## Usage

### Initialize

    var LightwaveRF = require("lightwaverf");
    var lw = new LightwaveRF({ip:"192.168.1.123"});

### Turn a device on

To turn a device on you need to have set it up using the mobile or web app. You need the room ID and the device ID.

    lw.turnDeviceOn(1 /*roomId*/, 1 /*deviceId*/, function(error, content) {
        if (error) {
            console.log("Error turning device on " + error.message);
        } else {
            console.log("Response: " + content);
        }
    });

### Turn a device off

To turn a device off you need to have set it up using the mobile or web app. You need the room ID and the device ID.

    lw.turnDeviceOff(1 /*roomId*/, 1 /*deviceId*/, function(error, content) {
        if (error) {
            console.log("Error turning device off " + error.message);
        } else {
            console.log("Response: " + content);
        }
    });

### Dim the device in a room

To turn a dim the device in a room you need to have set it up using the mobile or web app. You need the room ID and device ID.

    lw.setDeviceDim(1 /*roomId*/, 1 /*deviceId*/, 50 /*percentage from 0-100*/, function(error, content) {
        if (error) {
            console.log("Error changing dim of device " + error.message);
        } else {
            console.log("Response: " + content);
        }
    });

### Turn a room off

To turn a room off you need to have set it up using the mobile or web app. You need the room ID.

    lw.turnRoomOff(1 /*roomId*/, function(error, content) {
        if (error) {
            console.log("Error turning room off " + error.message);
        } else {
            console.log("Response: " + content);
        }
    });

### Request the energy status

To get the current status from the LightwaveRF Energy Monitor Smart Meter you need to have linked it to the Wi-Fi Link first.

    lw.requestEnergy(function(error, data) {
        if (error) {
            console.log("Error turning device off " + error.message);
        } else {
            //data: { current: 300, max: 620, today: 850, yesterday: 0 }
            console.log("Energy ", data);
        }
    });



