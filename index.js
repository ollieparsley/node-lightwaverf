var util = require('util');
var events = require('events');
var dgram = require('dgram');
var https = require('https');
var querystring = require('querystring');
var fs = require('fs');

/**
 * LightwaveRF API
 *
 * @param object config The config
 *
 * An instance of the LightwaveRF API
 */
function LightwaveRF(config,callback) {
    if (!(this instanceof LightwaveRF))  {
        return new LightwaveRF(config);
    }
    this.timeout = config.timeout || 1000;
    this.queue = [];
    this.ready = true;
    
    this.devices = [];//[{roomId:0,roomName:'',
    //deviceId:0,deviceName:'',
    //deviceType:''}];

	events.EventEmitter.call(this);
	
	//Counter
	this.messageCounter = 0;
	
	//Config
	this.config = config;
	
    if (this.config.file) {
        this.getFileConfiguration(this.config.file, callback);

    } else {
    	//Check config
        if(!this.config.host) {
            this.config.host = "web.trustsmartcloud.com"
        }
    	if (!this.config.ip) {
    		throw new Error("The IP address must be specified in the config");
    	}
        if(!this.config.email || !this.config.pin) {
            console.log("No email or pin specified. The server configuration (rooms, devices, etc.) cannot be obtained")
        }
        else {
            this.getConfiguration(this.config.email,this.config.pin,this.config.host,callback)
        }
    }
	
	//Response listeners
	this.responseListeners = {};
	
	//Send Socket
	this.sendSocket = dgram.createSocket("udp4");
	
	//Receive socket
	this.receiveSocket = dgram.createSocket("udp4");
	
	//Receive message
	this.receiveSocket.on("message", function (message, rinfo) {
		//console.log(" -- Receiver socket got: " + message + " from " + rinfo.address + ":" + rinfo.port);
		
		//Check this came from the lightwave unit
		if (rinfo.address !== this.config.ip) {
			//Came from wrong ip
			return false;
		}
		
		//Message
		message = message.toString("utf8");
        
        // Skip json formats (these start with *!)
        if(message.startsWith("*!")) {
            return false;
        }
		
		//Split off the code for the message
		var parts = message.split(",");
		var code = parts.splice(0,1);
		var content = parts.join(",").replace(/(\r\n|\n|\r)/gm,"");
		
		//Check to see if we have a relevant listener
		var responseListenerData = this.responseListeners[parseInt(code, 10).toString()];
		if (responseListenerData) {
			//Call the response listener
			responseListenerData.listener(code,content);
			delete this.responseListeners[code.toString()];
		}
		
	}.bind(this));
	this.receiveSocket.on("listening", function () {
		var address = this.receiveSocket.address();
		console.log("Receiver socket listening " + address.address + ":" + address.port);
	}.bind(this));
	
	//Bind to the receive port
	this.receiveSocket.bind(9761);
}
util.inherits(LightwaveRF, events.EventEmitter);

/**
 * Register this device with the Wi-Fi Link
 * 
 * @param Function callback The callback function
 * 
 * @return void
 */
LightwaveRF.prototype.register = function(callback) {
	this.sendUdp("!R1Fa", callback);
}

/**
 * Request energy
 * 
 * @param Function callback The callback function
 * 
 * @return void
 */
LightwaveRF.prototype.requestEnergy = function(callback) {
	this.sendUdp("@?\0", function(error, content) {
		if (error) {
			//Send error back
			callback(error);
		} else {
			//Determine if this is the energy monitor
			//ID,?W=current,max,today,yesterday (all kwh)
			var values = content.substring(3).split(",");
			callback(undefined, {
				current:   parseInt(values[0], 10),
				max:       parseInt(values[1], 10), 
				today:     parseInt(values[2], 10),
				yesterday: parseInt(values[3], 10)
			});
		}
	});
}

/**
 * Turn a device off
 * 
 * @param integer  roomId   The room ID
 * @param integer  deviceId The device ID
 * @param Function callback The callback for if there are any errors
 * 
 * @return void
 */
LightwaveRF.prototype.turnDeviceOff = function(roomId, deviceId, callback) {
	var state = "0";
	this.exec("!R" + roomId + "D" + deviceId + "F" + state + "|\0", callback);
}

/**
 * Turn a device on
 * 
 * @param integer  roomId   The room ID
 * @param integer  deviceId The device ID
 * @param Function callback The callback for if there are any errors
 * 
 * @return void
 */
LightwaveRF.prototype.turnDeviceOn = function(roomId, deviceId, callback) {
	var state = "1";
	this.exec("!R" + roomId + "D" + deviceId + "F" + state + "|\0", callback);
}

/**
 * Open a device
 *
 * @param integer  roomId   The room ID
 * @param integer  deviceId The device ID
 * @param Function callback The callback for if there are any errors
 *
 * @return void
 */
LightwaveRF.prototype.openDevice = function(roomId, deviceId, callback) {
    var state = ">";
    this.exec("!R" + roomId + "D" + deviceId + "F" + state + "|\0", callback);
}

/**
 * Close a device
 *
 * @param integer  roomId   The room ID
 * @param integer  deviceId The device ID
 * @param Function callback The callback for if there are any errors
 *
 * @return void
 */
LightwaveRF.prototype.closeDevice = function(roomId, deviceId, callback) {
    var state = "<";
    this.exec("!R" + roomId + "D" + deviceId + "F" + state + "|\0", callback);
}

/**
 * Stop a device
 *
 * @param integer  roomId   The room ID
 * @param integer  deviceId The device ID
 * @param Function callback The callback for if there are any errors
 *
 * @return void
 */
LightwaveRF.prototype.stopDevice = function(roomId, deviceId, callback) {
    var state = "^";
    this.exec("!R" + roomId + "D" + deviceId + "F" + state + "|\0", callback);
}

/**
 * Turn all devices in a room off
 * 
 * @param integer  roomId   The room ID
 * @param Function callback The callback for if there are any errors
 * 
 * @return void
 */
LightwaveRF.prototype.turnRoomOff = function(roomId, callback) {
	this.exec("!R" + roomId + "Fa\0", callback);
}

/**
 * Set the dim percentage of a device
 * 
 * @param integer  roomId        The room ID
 * @param integer  deviceId      The device ID
 * @param integer  dimPercentage The percentage to set the device dim
 * @param Function callback      The callback for if there are any errors
 * 
 * @return void
 */
LightwaveRF.prototype.setDeviceDim = function(roomId, deviceId, dimPercentage , callback) {
	var dimAmount = parseInt(dimPercentage * 0.32, 10); //Dim is on a scale from 0 to 32

    if (dimAmount === 0) {
        this.turnDeviceOff(roomId, deviceId, callback);
    } else {
        this.exec("!R" + roomId + "D" + deviceId + "FdP" + dimAmount + "|\0", callback);
    }
}

/**
 * Get message code
 * 
 * @return string
 */
LightwaveRF.prototype.getMessageCode = function() {
	//Increment message counter
	this.messageCounter++;
	
	//Get 3 digit code from counter
	var code = this.messageCounter.toString();
	while (code.length < 3) {
		code = "0" + code;
	}
	
	//Return the code
	return code;
}

LightwaveRF.prototype.send = function(cmd, callback) {
    this.sendUdp(cmd, callback);
    //if (callback) callback();
};

LightwaveRF.prototype.exec = function() {
    // Check if the queue has a reasonable size
    while(this.queue.length > 100) {
        this.queue.pop();
    }
    
    this.queue.push(arguments);
    this.process();
};

/**
 * Send a message over udp
 * 
 * @param string   message  The message to send
 * @param Function callback The callback for if there are any errors
 * 
 * @return void
 */
LightwaveRF.prototype.sendUdp = function(message, callback){
	//Add to message
	var code = this.getMessageCode();
	
	//Prepend code to message
	message = code + "," + message;
	
	console.log("Sending message: " + message);
	
	//Create buffer from message
	var buffer = new Buffer(message);
	
	//Broadcast the message
	this.sendSocket.send(buffer, 0, buffer.length, 9760, this.config.ip);
	
	//Add listener
	if (callback) {
		this.responseListeners[parseInt(code, 10).toString()] = {
			time: new Date().getTime(),
			listener: function(returnedCode, content) {
				callback(undefined, content);
			}
		}
	}
}

LightwaveRF.prototype.process = function() {
    if (this.queue.length === 0) return;
    if (!this.ready) return;
    var self = this;
    this.ready = false;
    this.send.apply(this, this.queue.shift());
    setTimeout(function () {
               self.ready = true;
               self.process();
               }, this.timeout);
};


/**
 * Parser to get de devices from https POST
 */
LightwaveRF.prototype.getDevices = function(roomsString,devicesString,typesString,callback){
    
    var nrRooms = 8;
    var nrDevicesPerRoom = 10;
    
    var tempRS = roomsString;
    var tempDS = devicesString;
    var tempTS = typesString;
    var deviceCounter = 0;
    for(var i=0;i<nrRooms;i++) {
        var rId = i+1;
        
        tempRS = tempRS.substring(tempRS.indexOf('\"')+1);
        var rName = tempRS.substring(0,tempRS.indexOf('\"'));
        tempRS = tempRS.substring(tempRS.indexOf('\"')+1);
        //console.log("room=" + rName);
        
        for(var j=0;j<nrDevicesPerRoom;j++) {
            var dId = j+1;
            
            tempDS = tempDS.substring(tempDS.indexOf('\"')+1);
            var dName = tempDS.substring(0,tempDS.indexOf('\"'));
            tempDS = tempDS.substring(tempDS.indexOf('\"')+1);
            //console.log("devices=" + dName);
            
            tempTS = tempTS.substring(tempTS.indexOf('\"')+1);
            var dType = tempTS.substring(0,tempTS.indexOf('\"'));
            tempTS = tempTS.substring(tempTS.indexOf('\"')+1);
            //console.log("devices=" + deviceName + " type=" + dType);
            
            // Get device types
            //   O: On/Off Switch
            //   D: Dimmer
            //   R: Radiator(s)
            //   P: Open/Close
            //   I: Inactive (i.e. not configured)
            //   m: Mood (inactive)
            //   M: Mood (active)
            //   o: All Off
            if(dType == "O" || dType == "D") {
                this.devices.push({roomId:rId,roomName:rName,
                                   deviceId:dId,deviceName:dName,
                                   deviceType:dType});
                //console.log("devices=" + deviceName + " type=" + deviceType);
                deviceCounter += 1;
            }
        }
    }
    
    if(callback) callback(this.devices, this);
    
    //console.log(this.devices);
}

/**
 * Connect to the server and obtain the configuration
 */
LightwaveRF.prototype.getConfiguration = function(email,pin,manager_host,callback){
    // An object of options to indicate where to post to
    var post_options = {
        //host: 'lightwaverfhost.co.uk',
        host: manager_host,//'web.trustsmartcloud.com',
        port: 443,
        path: '/manager/index.php',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        rejectUnauthorized:false
    };
    
    // Build the post string from an object
    var post_data = 'pin=' + pin + '&email=' + email;
    
    // Set up the request
    var that = this;
    var post_req = https.request(post_options, function(res) {
                                 var body = '';
                                 res.setEncoding('utf8');
                                 res.on('data', function (chunk) {
                                        body += chunk;
                                        
                                        // Too much POST data, kill the connection!
                                        // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
                                        if (body.length > 1e6)
                                            res.connection.destroy();
                                        
                                        //console.log('Response: ' + chunk);
                                        });
                                 res.on('end', function () {
                                        var bodyString = body.toString();
                                        
                                        // Get rooms
                                        // Rooms - gRoomNames is a collection of 8 values, or room names
                                        var indexRoomsStart = bodyString.indexOf('gRoomNames');
                                        
                                        if(indexRoomsStart < 0) {console.log('gRoomNames not found'); return;}
                                        
                                        var roomsString = bodyString.substring(indexRoomsStart);
                                        var indexRoomsEnd = roomsString.indexOf(';');
                                        roomsString = roomsString.substring(0,indexRoomsEnd);
                                        
                                        //console.log(roomsString);
                                        
                                        // Get devices
                                        // Devices - gDeviceNames is a collection of 80 values, structured in blocks of ten values for each room:
                                        //   Devices 1 - 6, Mood 1 - 3, All Off
                                        var indexDevicesStart = bodyString.indexOf('gDeviceNames');
                                        
                                        if(indexDevicesStart < 0) {console.log('gDeviceNames not found'); return;}
                                        
                                        var devicesString = bodyString.substring(indexDevicesStart);
                                        var indexDevicesEnd = devicesString.indexOf(';');
                                        devicesString = devicesString.substring(0,indexDevicesEnd);
                                        
                                        //console.log(devicesString);
                                        
                                        // Get device types
                                        //   O: On/Off Switch
                                        //   D: Dimmer
                                        //   R: Radiator(s)
                                        //   P: Open/Close
                                        //   I: Inactive (i.e. not configured)
                                        //   m: Mood (inactive)
                                        //   M: Mood (active)
                                        //   o: All Off
                                        var indexTypesStart = bodyString.indexOf('gDeviceStatus');
                                        
                                        if(indexTypesStart < 0) {console.log('gDeviceStatus not found'); return;}
                                        
                                        var typesString = bodyString.substring(indexTypesStart);
                                        var indexTypesEnd = typesString.indexOf(';');
                                        typesString = typesString.substring(0,indexTypesEnd);
                                        
                                        //console.log(typesString);
                                        
                                        that.getDevices(roomsString,devicesString,typesString,callback);
                                        
                                        });
                                 });
    
    // post the data
    post_req.write(post_data);
    post_req.end();
}

module.exports = LightwaveRF;
