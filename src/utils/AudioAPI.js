"use strict";

const configuration = require("./configuration.js");
const staticMethods = require("./staticMethods.js");
const request = require("request");
const encoding = require("encoding");
const VKResponse = require("./VKResponse.js");


class AudioAPI {

	constructor (vk, http) {
		let self = this;
		self._vk = vk;
		self._http = http;
		self._authjar = self._http._authjar;

		self.AudioObject = {
			AUDIO_ITEM_INDEX_ID: 0,
	        AUDIO_ITEM_INDEX_OWNER_ID: 1,
	        AUDIO_ITEM_INDEX_URL: 2,
	        AUDIO_ITEM_INDEX_TITLE: 3,
	        AUDIO_ITEM_INDEX_PERFORMER: 4,
	        AUDIO_ITEM_INDEX_DURATION: 5,
	        AUDIO_ITEM_INDEX_ALBUM_ID: 6,
	        AUDIO_ITEM_INDEX_AUTHOR_LINK: 8,
	        AUDIO_ITEM_INDEX_LYRICS: 9,
	        AUDIO_ITEM_INDEX_FLAGS: 10,
	        AUDIO_ITEM_INDEX_CONTEXT: 11,
	        AUDIO_ITEM_INDEX_EXTRA: 12,
	        AUDIO_ITEM_INDEX_HASHES: 13,
	        AUDIO_ITEM_INDEX_COVER_URL: 14,
	        AUDIO_ITEM_INDEX_ADS: 15,
	        AUDIO_ITEM_INDEX_SUBTITLE: 16,
	        AUDIO_ITEM_INDEX_MAIN_ARTISTS: 17,
	        AUDIO_ITEM_INDEX_FEAT_ARTISTS: 18,
	        AUDIO_ITEM_INDEX_ALBUM: 19,
	        AUDIO_ITEM_CAN_ADD_BIT: 2,
	        AUDIO_ITEM_CLAIMED_BIT: 4,
	        AUDIO_ITEM_HQ_BIT: 16,
	        AUDIO_ITEM_LONG_PERFORMER_BIT: 32,
	        AUDIO_ITEM_UMA_BIT: 128,
	        AUDIO_ITEM_REPLACEABLE: 512,
	        AUDIO_ITEM_EXPLICIT_BIT: 1024
		}

	}

	get (params = {}) {
		return new Promise((resolve, reject) => {
			let self = this;

			let uid = self._vk.session.user_id,
				playlist_id = -1, 
				offset = 0;

			if (params.owner_id) { params.owner_id = Number(params.owner_id);
			} else if (uid) {params.owner_id = uid;} 

			if (params.playlist_id) { params.playlist_id = Number(params.playlist_id);
				if (!isNaN(params.playlist_id)) playlist_id = params.playlist_id;
			}

			if (params.offset) { params.offset = Number(params.offset);
				if (!isNaN(params.offset)) offset = params.offset;
			}

			if (!params.owner_id) return reject(new Error('User id not defined in your session, use vk.sesion.user_id = X'));

			self._request({
				act: 'load_section',
				al: 1,
				claim: 0,
				offset: offset,
				owner_id: params.owner_id,
				playlist_id: playlist_id,
				type: 'playlist'
			}).then(res => {

				let json = self._parseJSON(res.body);
				if (json instanceof Promise) return;

				let audios = json.list;

				return self._getNormalAudiosWithURL(audios).then(audios => {
					
					if (!params.needAll) {
						json.list = undefined;
					}

					resolve({
						vk: self._vk,
						json: json,
						vkr: VKResponse(staticMethods, {
							response: audios
						})
					});

				});
			});
		})
	}

	getCount (params = {}) {
		
		let self = this;

		return new Promise((resolve, reject) => {
			self.get({
				owner_id: params.owner_id
			}).then(({json}) => {
				return resolve({
					vk: self._vk,
					vkr: VKResponse(staticMethods, {
						response: json.totalCount
					})
				});
			}, reject);
		});

	}

	getById (params = {}) {
		let self = this;

		return new Promise((resolve, reject) => {

			self._request({
				act: 'reload_audio',
				al: 1,
				ids: params.ids
			}).then((res) => {


				let audios = self._parseJSON(res.body);

				if (audios instanceof Promise) return;
				

				for (let i = 0; i < audios.length; i++) audios[i] = self._getAudioAsObject(audios[i]);


				return resolve({
					vkr: VKResponse(staticMethods, {
						response: audios
					}),
					vk: self._vk,
					json: JSON.parse(res.body.match(/<!json>(.*?)<!>/)[1])
				});

			});

		});

	}

	getLyrics (params = {}) {
		let self = this;

		return new Promise((resolve, reject) => {
			self._request({
				act: 'get_lyrics',
				al: 1,
				lid: params.lyrics_id
			}).then((res) => {

				let text = res.body;
				text = text.split('<!>');
				text = text[text.length - 1];

				resolve({
					vkr: VKResponse(staticMethods, {response: {text: text}}),
					vk: self._vk
				});

			});
		});

	}


	getUploadServer (params = {}) {
		let self = this;

		if (!params.group_id) params.group_id = 0;

		return new Promise((resolve, reject) => {
			self._request({
				act: 'new_audio',
				al: 1,
				gid: params.group_id
			}).then(res => {

				let matches = res.body.match(/Upload\.init\((.*)/)[0];
				matches = String(matches).replace(/Upload\.init\(/, "").split(', ');
				
				let url = matches[1].replace(/'|"/g, "");
				let queryString = JSON.parse(matches[2]);
				queryString = staticMethods.urlencode(queryString);

				resolve({
					vk: self._vk,
					vkr: VKResponse(staticMethods, {
						response: {
							upload_url: url + '?' + queryString
						}
					})
				});

			});
		})
	}

	upload() {
		let self = this;
		let args = arguments;

		return new Promise((resolve, reject) => {

			self._vk.uploader.uploadFile(args[0], args[1], 'file', {
				custom: true
			}).then(({vkr}) => {

				let matches = vkr.match(/parent\.\((.*)\)\;/);
				let audio = matches[1].replace(/^'{/, "{").replace(/}'/, "}").replace(/\\/g, "");				
				
				try {
					audio = JSON.parse(audio);
				} catch (e) {
					return reject(self._vk._error("invalid_response", {
						where: 'audio.upload',
						more: e
					}));
				}

				return resolve({
					vk: self._vk,
					vkr: VKResponse(staticMethods, {
						response: audio
					})
				});

			});

		});

	}

	save (data = {}) {
		let self = this;

		return new Promise((resolve, reject) => {
			data.act = 'done_add';
			data.al = 1;

			self._request(data).then(vkr => {


				vkr = vkr.body;

				let matches = vkr.match(/top\.cur\.loadAudioDone\((.*)\)\;/);
				let audio = matches[1].replace(/\'\[/, "[").replace(/\]\'/, "]").replace(/\\/g, "");

				let json = audio;

				try {
					json = JSON.parse(json);
				} catch (e) {
					return reject(new Error('Not founded sounds, may be algorythm changed or just user blocked access for you'));
				}


				self._getNormalAudiosWithURL([json]).then(audios => {
					resolve({
						vkr: VKResponse(staticMethods, {
							response: audios[0],
						}),
						json: json,
						vk: self._vk
					});
				});

			});
		});

	}


	_request (form = {}) {

		let self = this;

		return new Promise((resolve, reject) => {


			request.post({
				jar: self._authjar,
				url: `${configuration.PROTOCOL}://${configuration.BASE_DOMAIN}/al_audio.php`,
				form: form,
				encoding: "binary"
			}, (err, res, vkr) => {

				if (err) {
					return reject(err);
				}

				res.body = encoding.convert(res.body, 'utf-8', 'windows-1251').toString();
				
				if (!res.body.length) {
					return reject(new Error('No have access on this'));
				}

				return resolve(res);

			});


		});


	}

	_parseJSON (body, reject) {
		
		let json = body.match(/<!json>(.*?)<!>/);
		
		if (body.match(/<\!bool><\!>/)) {
			return reject(new Error('Blocked access for you'));
		}

		if (!json) {
			return reject(new Error('Not founded audios, maybe algorythm changed'));
		}

		try {
			
			json = JSON.parse(json[1]);

		} catch (e) {
			return reject(new Error('Not founded sounds, may be algorythm changed or just user blocked access for you'));
		}

		return json;
	}
	

	_getNormalAudiosWithURL (audios) {
		let self = this;

		return new Promise((resolve, reject) => {

			let audios_ = new Array(audios.length);
			let withoutURL = [];


			//first step - hashing for maintain order
			for (let i = 0; i < audios.length; i++) {
				
				let audio = audios[i];

				if (!audio[self.AudioObject.AUDIO_ITEM_INDEX_URL]) {
					withoutURL.push(i);
				} else {
					audios_[i] = self._getAudioAsObject(audio);
				}

			}


			function nextAudios () {

				let _audioWithoutURL = withoutURL.splice(0, 10);
				let __audioWithoutURL = _audioWithoutURL.slice(0, _audioWithoutURL.length);

				for (let i = 0; i < _audioWithoutURL.length; i++) {
					__audioWithoutURL[i] = self._getAdi(audios[_audioWithoutURL[i]]).join('_');
				}



				self.getById({
					ids: __audioWithoutURL.join(',')
				}).then(({json: _audios}) => {

					for (let i =0; i < _audios.length; i++) {
						audios_[_audioWithoutURL[i]] = self._getAudioAsObject(_audios[i]);
					}

					if (withoutURL.length) {
						setTimeout(nextAudios, 300);
					} else {

						let endAudios = [];

						for (let i = 0; i < audios_.length; i++) {
							if (audios_[i]) {
								endAudios.push(audios_[i]);
							}
						}

						resolve(endAudios);

					}
					
				}).catch(() => {
					console.log('Something error occured... I don\'t know what is this. (/src/utils/http.js:search[method])');
				});
			}

			nextAudios();

		});

	}

	search (params = {}) {
		let self = this;

		return new Promise((resolve, reject) => {

			self._request({
				act: 'section',
				al: 1,
				claim: 0,
				offset: params.offset,
				owner_id: (params.owner_id || self._vk.session.user_id),
				q: params.q,
				section: 'search'
			}).then(res => {
				
				let json, audios = [], audioWithoutURL = [];

				json = self._parseJSON(res.body, reject);
				if (json instanceof Promise) return;
				
				audios = json.playlists[0].list;

				self._getNormalAudiosWithURL(audios).then((audios) => {
					resolve({
						vk: self._vk,
						json: json,
						vkr: VKResponse(staticMethods, {
							response: audios
						})
					});
				}, () => {
					reject(new Error('I don\t know what is this, in next releases it will be fixed'));
				});
			});

		});

	}

	_getAdi (audio) {
		let adi = [audio[1], audio[0]];
		let e = audio[13].split('/');

		let addHash = e[0]||"", 
			editHash = e[1]||"", 
			actionHash = e[2]||"", 
			deleteHash = e[3]||"", 
			replaceHash = e[4]||"";

		if (actionHash) adi[2] = actionHash;

		return adi;

	}
	
	_getAudioAsObject (audio = []) {
		
		let self = this;

		let source = self.__UnmuskTokenAudio(audio[self.AudioObject.AUDIO_ITEM_INDEX_URL], self._vk.session.user_id);
		
		if (!source || source.length == 0) {
			//need get reloaded audio
			async function getAudioWithURL() {
				return (await (
					self.getById({
						ids: self._getAdi(audio).join('_')
					}).then(({json}) => {
						return self._getAudioAsObject(json[0]);
					}).catch(() => {
						return null;
					})
				));
			}

			return getAudioWithURL();
		}

		let e = (audio[self.AudioObject.AUDIO_ITEM_INDEX_HASHES] || "").split('/');
		let c = (audio[self.AudioObject.AUDIO_ITEM_INDEX_COVER_URL] || "");
		let c_l = c.split(',');

		let audio_ = {
			id: audio[self.AudioObject.AUDIO_ITEM_INDEX_ID],
			owner_id: audio[self.AudioObject.AUDIO_ITEM_INDEX_OWNER_ID],
			url: source,
			title: audio[self.AudioObject.AUDIO_ITEM_INDEX_TITLE],
			performer: audio[self.AudioObject.AUDIO_ITEM_INDEX_PERFORMER],
			duration: audio[self.AudioObject.AUDIO_ITEM_INDEX_DURATION],
			covers: c,
			coverUrl_s: c_l[0],
            coverUrl_p: c_l[1],
			flags: audio[self.AudioObject.AUDIO_ITEM_INDEX_FLAGS],
			hq: !!(audio[self.AudioObject.AUDIO_ITEM_INDEX_FLAGS] & self.AudioObject.AUDIO_ITEM_HQ_BIT),
			claimed: !!(audio[self.AudioObject.AUDIO_ITEM_INDEX_FLAGS] & self.AudioObject.AUDIO_ITEM_CLAIMED_BIT),
			uma: !!(audio[self.AudioObject.AUDIO_ITEM_INDEX_FLAGS] & self.AudioObject.AUDIO_ITEM_UMA_BIT),
			album_id: audio[self.AudioObject.AUDIO_ITEM_INDEX_ALBUM_ID],
			full_id: audio[self.AudioObject.AUDIO_ITEM_INDEX_OWNER_ID] + "_" + audio[self.AudioObject.AUDIO_ITEM_INDEX_ID],
			explicit: !!(audio[self.AudioObject.AUDIO_ITEM_INDEX_FLAGS] & self.AudioObject.AUDIO_ITEM_EXPLICIT_BIT),
			subtitle: audio[self.AudioObject.AUDIO_ITEM_INDEX_SUBTITLE],
			add_hash: e[0] || "",
            edit_hash: e[1] || "",
            action_hash: e[2] || "",
            delete_hash: e[3] || "",
            replace_hash: e[4] || "",
            can_edit: !!e[1],
            can_delete: !!e[3],
            can_add: !!(audio[self.AudioObject.AUDIO_ITEM_INDEX_FLAGS] & self.AudioObject.AUDIO_ITEM_CAN_ADD_BIT),
            ads: audio[self.AudioObject.AUDIO_ITEM_INDEX_ADS],
            album: audio[self.AudioObject.AUDIO_ITEM_INDEX_ALBUM],
            replaceable: !!(audio[self.AudioObject.AUDIO_ITEM_INDEX_FLAGS] & self.AudioObject.AUDIO_ITEM_REPLACEABLE),
            context: audio[self.AudioObject.AUDIO_ITEM_INDEX_CONTEXT]
		}

		if (audio[19]) {
			audio_.lyrics_id = audio[19][1];
		}

		return audio_;

	}

	_responseIsAudioOrPromise (f, resolve, params = {}) {
		let self = this;

		params.vk = self._vk;

		if (staticMethods.isObject(f)) {
			params.vkr = VKResponse(staticMethods, {
				response: f 
			});
			resolve(params);
		} else {
			f.then((audio) => {
				params.vkr = VKResponse(staticMethods, {
					response: audio
				});
				resolve(params);
			});
		}

	}

	__UnmuskTokenAudio(e, vk_id = 1)
	{
		//This code is official algorithm for unmusk audio source
		//Took from vk.com website, official way, no magic
		
		var n = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN0PQRSTUVWXYZO123456789+/=",
		    i = {
		        v: function(e) {
		            return e.split("").reverse().join("")
		        },
		        r: function(e, t) {
		            e = e.split("");
		            for (var i, o = n + n, r = e.length; r--;) i = o.indexOf(e[r]), ~i && (e[r] = o.substr(i - t, 1));
		            return e.join("")
		        },
		        s: function(e, t) {
		            var n = e.length;
		            if (n) {
		                var i = s(e, t),
		                    o = 0;
		                for (e = e.split(""); ++o < n;) e[o] = e.splice(i[n - 1 - o], 1, e[o])[0];
		                e = e.join("")
		            }
		            return e
		        },
		        i: function(e, t) {
		            return i.s(e, t ^ vk_id)
		        },
		        x: function(e, t) {
		            var n = [];
		            return t = t.charCodeAt(0), each(e.split(""), function(e, i) {
		                n.push(String.fromCharCode(i.charCodeAt(0) ^ t))
		            }), n.join("")
		        }
		    };

		function o() {
		    return false;
		}

		function r(e) {
		    if (!o() && ~e.indexOf("audio_api_unavailable")) {
		        var t = e.split("?extra=")[1].split("#"),
		            n = "" === t[1] ? "" : a(t[1]);
		        if (t = a(t[0]), "string" != typeof n || !t) return e;
		        n = n ? n.split(String.fromCharCode(9)) : [];
		        for (var r, s, l = n.length; l--;) {
		            if (s = n[l].split(String.fromCharCode(11)), r = s.splice(0, 1, t)[0], !i[r]) return e;
		            t = i[r].apply(null, s)
		        }
		        if (t && "http" === t.substr(0, 4)) return t
		    }
		    return e
		}

		function a(e) {
		    if (!e || e.length % 4 == 1) return !1;
		    for (var t, i, o = 0, r = 0, a = ""; i = e.charAt(r++);) i = n.indexOf(i), ~i && (t = o % 4 ? 64 * t + i : i, o++ % 4) && (a += String.fromCharCode(255 & t >> (-2 * o & 6)));
		    return a
		}

		function s(e, t) {
		    var n = e.length,
		        i = [];
		    if (n) {
		        var o = n;
		        for (t = Math.abs(t); o--;) t = (n * (o + 1) ^ t + o) % n, i[o] = t
		    }
		    return i
		}

		return r(e);
	}
}


module.exports = AudioAPI;
