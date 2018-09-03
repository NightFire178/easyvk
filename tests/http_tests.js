/**
 *  In your code you need require easyvk so: require('easyvk')
 */

const path = require('path')

const _easyvk = path.join(__dirname, 'easyvk.js')

const easyVK = require(`${_easyvk}`)


const currentSessionFile = path.join(__dirname, '.vksession')

/*
 *
 * This test is testing all my Http widgets
 */


easyVK({
	username: '{LOGIN_HERE}',
	password: '{PASSWORD_HERE}',
	api_v: '5.73',
	save_session: true,
	session_file: currentSessionFile,
	// reauth: true,
}).then(vk => {

	const HttpVK = vk.http;


	// First: You need authenticate by HTTP form, 
	// with login and password
	return HttpVK.loginByForm().then(({vk: EasyVK, client: Client}) => {

		//Only after this you can read/watch stories from feed and from user_account

		const user_id = 1; //read all Pavel's stories
		
		Client.readStories(user_id).then(({count, vk: EasyVK}) => {
			//Count of stories, that readed
			console.log(count + ` [;user_id = ${user_id}, stories count]`);

		});

		Client.readFeedStories().then(({count}) => {
			console.log(count + ' [feed stories]');
		});

		//This script shows you how to get all user's audios
		//offset - is offset :D

		function getAllAudios () {
			let audios = [];

			function newReq (offset = 0) {
				return new Promise((resolve, reject) => {

					Client.audio.get({
						owner_id: vk.session.user_id,
						offset: offset,
						playlist_id: -1
					}).then(({vkr: audios_, json}) => {
						audios = [...audios, ...audios_];
						if (json.hasMore) {
							newReq(json.nextOffset).then(resolve, reject);
						} else {
							resolve(audios);
						}

					});
				})
			}

			return newReq;
		}

		Client.audio.get({
			owner_id: -45703770,
			offset: 0,
			playlist_id: -1
		}).then(({vkr}) => {
			console.log(vkr.length);
		});

		Client.audio.getCount({
			owner_id: -45703770
		}).then(({vkr}) => {
			console.log(vkr);
		})

		Client.audio.getById({
			ids: '-45703770_456242594'
		}).then(({vkr, json}) => {
			
			Client.audio.getLyrics(vkr[0]).then(({vkr}) => {
				console.log(vkr)
			});
		});


		// Client.audio.getUploadServer().then(({vkr}) => {
		
		// 	let url = vkr.upload_url;

		// 	Client.audio.upload(url, __dirname + '/main.mp3').then(({vkr}) => {
		// 		return Client.audio.save(vkr, {
		// 			title: 'Название',
		// 			artist: 'Артист'
		// 		});
		// 	}).then(({vkr}) => {
				
		// 		console.log(vkr, 'saved audio');

		// 	});

		// });

		Client.audio.search({
			q: 'The beatles',
		}).then(({vkr}) => {
			console.log(vkr);
		});

	});

});