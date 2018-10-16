"use strict";

const request = require("request");
const staticMethods = require("./staticMethods.js");
const EventEmitter = require("events");


class LongPollConnection extends EventEmitter { 

	constructor (lpSettings, vk) {

		super();

		let self = this;

		self.config = lpSettings;
		self._vk = vk;
		self.userListeners = {};
		
		self.supportEventTypes = {
			"4": "message",
			"8": "friendOnline",
			"9": "friendOffline",
			"51": "editChat",
			"61": "typeInDialog",
			"62": "typeInChat",
		};

		init();

		function init () {
			let server, forLongPollServer, _w;

			server = `${self._vk.config.PROTOCOL}://${self.config.longpollServer}?`;
			forLongPollServer = {};
			_w = null;


			forLongPollServer.act = "a_check";
			forLongPollServer.key = self.config.longpollKey;
			forLongPollServer.ts = self.config.longpollTs;
			forLongPollServer.mode = self.config.userConfig.forLongPollServer.mode;
			forLongPollServer.version = self.config.userConfig.forLongPollServer.version;
			forLongPollServer.wait = self.config.userConfig.forLongPollServer.wait;

			if (isNaN(forLongPollServer.mode)) {
				forLongPollServer.mode = (128 + 32 + 2);
			}

			if (isNaN(forLongPollServer.version)) {
				forLongPollServer.version = "2";
			}

			
			_w = Number(forLongPollServer.wait);

			forLongPollServer = staticMethods.urlencode(forLongPollServer);
			
			let params = {
				url: server + forLongPollServer,
				timeout: (_w * 1000) + (1000 * 3)
			}

			if (self._debug) {
				
				self._debug({
					type: "longPollParamsQuery",
					data: params
				});

			}

			self.lpConnection = request.get(params, (err, res) => {

				if (err) {
					self.emit("error", err);
				} else {

					if (self._vk.debugger) {
						try {
							self._vk.debugger.push("response", res.body);
						} catch (e) {
							//Ignore
						}
					}
					
					if (self._debug) self._debug({
						type: "pollResponse",
						data: res.body
					});

					let vkr = staticMethods.checkJSONErrors(res.body, (vkrError) => {
						self.emit("error", vkrError);
					});

					if (vkr) {
						//Ok
						if (vkr.failed) {
							
							if (vkr.failed === 1) { //update ts
								
								if (vkr.ts) {
									self.config.longpollTs = vkr.ts;
								}

								init();

							} else if ([2,3].indexOf(vkr.failed) != -1) { //need reconnect
								
								self._vk.call("messages.getLongPollServer", self.config.userConfig.forGetLongPollServer).then(({vkr}) => {
									
									self.config.longpollServer = vkr.server;
									self.config.longpollTs = vkr.ts;
									self.config.longpollKey =  vkr.key;

									init(); //reconnect with new parameters

								}).catch((err) => {
									
									self.emit("reconnectError", new Error(err));

								});

							} else {
								self.emit("failure", vkr);
							}

						} else {
							if (vkr.ts) {
								self.config.longpollTs = vkr.ts;
							}
							
							if (vkr.updates) {
								if (vkr.updates.length > 0) {
									self._checkUpdates(vkr.updates);
								}
							}

							init();

						}

					}

				}

			});

		}

	}

	_checkUpdates(updates) {
		let self = this;
		
		if (Array.isArray(updates)) {
			for (let updateIndex = 0; updateIndex < updates.length; updateIndex++) {

				let typeEvent = updates[updateIndex][0].toString();
				
				if (self.supportEventTypes[typeEvent]) {
					
					typeEvent = self.supportEventTypes[typeEvent];
					
					try {
						
						if (self.userListeners[typeEvent]) {
							self.userListeners[typeEvent](updates[updateIndex]);
						} else {
							self.emit(typeEvent, updates[updateIndex]);
						}

					} catch (e) {
						self.emit("error", e);
					}

				} else {
					self.emit("update", updates[updateIndex]);
				}

			}

		} else {
			return "Is not array!";
		}

	}

	/**
	 *
	 *	If my SDK not support certain event it doesn't mean that my SDK not support it :D
	 *	You can add yours listeners with this function.
	 *	
	 *	Docs: vk.com/dev/using_longpoll
	 *
	 *	@param {Number} eventCode number of event which you can find on the docs page
	 *	@param {Function} handler is a handler function
	 *
	 */


	async addEventCodeListener (eventCode, handler) { //Only for create new event listeneres (if there are not in default listeners, you can get a code and add it!)
		let self = this;

		return new Promise((resolve, reject) => {
			
			if (isNaN(eventCode)) {
				return reject(self._vk._error("is_not_number", {
					"where": "LongPoll.addEventCodeListener",
					"parameter": "eventCode"
				}));
			} else if (Object.prototype.toString.call(handler) !== "[object Function]") {
				return reject(self._vk._error("is_not_function", {
					"where": "LongPoll.addEventCodeListener",
					"parameter": "handler"
				}));
			} else {
				
				eventCode = eventCode.toString();
				
				if (!self.supportEventTypes[eventCode]) {
					
					self.supportEventTypes[eventCode] = eventCode;
					self.userListeners[eventCode] = handler;

				} else {
					return reject(self._vk._error("longpoll_api", {}, "event_already_have"));
				}

			}

		});
	}

	
	async close () {
		let self = this;

		return new Promise ((resolve, reject) => {
			
			if (self.lpConnection) {
				
				self.emit("close", {
					time: new Date().getTime(),
				});

				return resolve(self.lpConnection.abort());

			} else {
				return reject(self._vk._error("longpoll_api", {}, "not_connected"));
			}

		});
	}

	debug (debugg) {

		let self = this;

		if (Object.prototype.toString.call(debugg).match(/function/i)) {
			self._debug = debugg;
		} else {
			return false;
		}

		return self;
	}
}

class LongPollConnector {

	constructor (vk) {
		let self = this; //For the future
		self._vk = vk;
	}

	async connect (params = {}) {
		let self = this;

		return new Promise ((resolve, reject) => {
			if (!staticMethods.isObject(params)) {
				return reject(self._vk._error("is_not_object", {
					"where": "LongPoll.connect",
					"parameter": "params"
				}));
			} else {
				
				if (params.forGetLongPollServer) {
					
					if (!staticMethods.isObject(params.forGetLongPollServer)) {
						params.forGetLongPollServer = {};
					}

				} else {
					params.forGetLongPollServer = {};
				}


				if (params.forLongPollServer) {
					
					if (!staticMethods.isObject(params.forLongPollServer)) {
						params.forLongPollServer = {};
					}

				} else {
					params.forLongPollServer = {};
				}


				if (isNaN(params.forGetLongPollServer.lp_version)) {
					params.forGetLongPollServer.lp_version = "2";
				}

				if (isNaN(params.forLongPollServer.wait)) {
					params.forLongPollServer.wait = "25";
				}


				self._vk.call("messages.getLongPollServer", params.forGetLongPollServer)
				.then(({vkr}) => {
					
					let forLongPoll = {
						longpollServer: vkr.server,
						longpollTs: vkr.ts,
						longpollKey: vkr.key,
						responseGetServer: vkr,
						userConfig: params
					};
					
					let con = new LongPollConnection(forLongPoll, self._vk);

					return resolve({
						connection: con,
						vk: self._vk
					});

				}, reject);

			}

		});
	}
}

module.exports = LongPollConnector;
