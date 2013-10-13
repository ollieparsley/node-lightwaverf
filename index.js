var util = require('util');
var events = require('events');
var dgram = require('dgram');

/**
 * LightwaveRF API
 *
 * @param object config The config
 *
 * An instance of the LightwaveRF API
 */
function LightwaveRF(config) {
	events.EventEmitter.call(this);
	
	//Counter
	this.messageCounter = 0;
	
	//Config
	this.config = config;
	
	//Check config
	if (!this.config.ip) {
		throw new Error("The IP address must be specified in the config");
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
		
		//Split off the code for the message
		var parts = message.split(",");
		var code = parts.splice(0,1);
		var content = parts.join(",").replace(/(\r\n|\n|\r)/gm,"");
		
		//Check to see if we have a relevant listener
		var responseListenerData = this.responseListeners[code.toString()];
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
				current:   parseInt(values[0]),
				max:       parseInt(values[1]), 
				today:     parseInt(values[2]),
				yesterday: parseInt(values[3])
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
	this.sendUdp("!R" + roomId + "D" + deviceId + "F" + state + "|\0", callback);
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
LightwaveRF.prototype.turnDeviceOn = function(roomId, deviceId, callback) {
	var state = "1";
	this.sendUdp("!R" + roomId + "D" + deviceId + "F" + state + "|\0", callback);
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
	this.sendUdp("!R" + roomId + "Fa\0", callback);
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
	var dimAmount = parseInt(dimPercentage * 0.32); //Dim is on a scale from 0 to 32
	this.sendUdp("!R" + roomId + "D" + deviceId + "FdP" + dimAmount + "|\0", callback);
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
	
	//console.log("Sending message: " + message);
	
	//Create buffer from message
	var buffer = new Buffer(message);
	
	//Broadcast the message
	this.sendSocket.send(buffer, 0, buffer.length, 9760, this.config.ip);
	
	//Add listener
	if (callback) {
		this.responseListeners[parseInt(code).toString()] = {
			time: new Date().getTime(),
			listener: function(returnedCode, content) {
				callback(undefined, content);
			}
		}
	}

}

module.exports = LightwaveRF;