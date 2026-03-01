import { Account, Avatars, Client, Storage, TablesDB } from 'appwrite';
import { appEnv } from './env';

const client = new Client()
    .setEndpoint(appEnv.appwriteEndpoint)
    .setProject(appEnv.appwriteProjectId);

export const appwriteClient = client;
export const appwriteAccount = new Account(client);
export const appwriteAvatars = new Avatars(client);
export const appwriteStorage = new Storage(client);
export const appwriteTablesDB = new TablesDB(client);
