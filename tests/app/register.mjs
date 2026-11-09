// Registers the module hooks of loader.mjs. Used as: node --import ./tests/app/register.mjs --test tests/app/
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);
