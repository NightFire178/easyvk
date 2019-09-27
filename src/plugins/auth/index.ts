import Plugin from "../../structures/plugin/plugin";

export const GROUP_AUTH_TYPE = "group";
export const USER_AUTH_TYPE = "user";
export const APP_AUTH_TYPE = "app";

/** Type of supported platforms for authenticate user */
export const Platforms = {
    Android: {
        client: {
            id: 2274003,
            secret: "hHbZxrka2uZ6jB1inYsH"  
        },
        name: "ANDROID"
    },
    IOS: {
        client: {
            id: 3140623,
            secret: "VeWdmVclDCtn6ihuP1nt"
        },
        name: "IOS"
    },
    Windows: {
        client: {
            id: 3697615,
            secret: "AlVXZFMUqyrnABp8ncuU"
        },
        name: "Windows Client"
    }
}

interface IAuthOptions {
    /** Accesss token for requests (group, user, app) */
    token?:string
    /** Auth type which will be used for get data for session */
    type?: "group" | "user" | "app"
    /** Username on vk.com */
    username?:string|number
    /** Password */
    password?:string
    /** Applications id which will be used for authenticate user */
    clientId?:string|number
    /** Application secret which will be used for authenticate user */
    clientSecret?:string
}

class Auth extends Plugin {
    public name = 'auth';
    public options:IAuthOptions = {}

    async onEnable (options: IAuthOptions) {
        this.options = {...options}

        if (this.options.token) {
            return this.initTokenType().then(() => this.linkIt());
        } else if (this.options.username || this.options.password) {

        } else if (this.options.clientId || this.options.clientSecret) {

        } else {
            throw new Error('Authentication data is empty');
        }
    }

    /**
     * This makes authentication with access token
     */
    initTokenType ():Promise<any> {
        const {groupsMethod, usersMethod, appsMethod} = this.vk.options.auth;
        let authMethod = usersMethod;

        // Setting new default access_token
        this.vk.defaults({
            access_token: this.options.token
        });
        console.log(this.options)
        if (this.options.type) {
            switch (this.options.type) {
                case GROUP_AUTH_TYPE:
                    authMethod = groupsMethod;
                    break;
                case USER_AUTH_TYPE:
                    authMethod = usersMethod;
                    break;
                case APP_AUTH_TYPE:
                    authMethod = appsMethod;
                    break;
                default:
                    throw new Error(`Auth type is not supported (user, group, app) your type is ${this.options.type}`);
            }
            
            return this.vk.api.call(authMethod).then((res) => {
                if (res.length) return true;
                else throw new Error(`This token not valid for this authentication type (${this.options.type})`)
            });

        } else {
            return new Promise(async (resolve) => {
                let methods = [groupsMethod, usersMethod, appsMethod];
                for (let method of methods) {
                    let res = await this.vk.api.call(method);
                    if (res.length) {
                        break;
                    }
                }
                return resolve(true);
            });
        }
    }

    /**
     * Links auth to main library class
     */
    linkIt ():Auth {
        
        if (!this.vk.linked(this.name)) {
            this.vk.link(this.name, this);
        }

        return this;
    }
}

export default Auth;