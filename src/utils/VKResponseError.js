

// This is an error object. Contains: code, message, desciption and other information from the stack

class VKResponseError extends Error {
	constructor (message, code = 0, request = {}) {
		
		super(message); //generate message
		
		this.error_code = code;
		this.request_params = request;
		this.error_msg = message;
		//done
	}
}

module.exports = VKResponseError;
