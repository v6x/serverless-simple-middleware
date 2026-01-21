import { Handler, HandlerAuxBase, HandlerPluginBase } from './base';
declare const build: <Aux extends HandlerAuxBase>(plugins: Array<HandlerPluginBase<any>>) => (handler: Handler<Aux>) => (event: any, context: any, callback: any) => void;
export default build;
