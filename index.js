/**
 * Module dependencies.
 */

var uid2 = require('uid2');
var redis = require('redis').createClient;
var msgpack = require('msgpack-js');
var Adapter = require('socket.io-adapter');
var Emitter = require('events').EventEmitter;
var debug = require('debug')('socket.io-redis');

/**
 * Module exports.
 */

module.exports = adapter;

/**
 * Returns a redis Adapter class.
 *
 * @param {String} optional, redis uri
 * @return {RedisAdapter} adapter
 * @api public
 */

function adapter(uri, opts){
  opts = opts || {};

  // handle options only
  if ('object' == typeof uri) {
    opts = uri;
    uri = null;
  }

  // handle uri string
  if (uri) {
    uri = uri.split(':');
    opts.host = uri[0];
    opts.port = uri[1];
  }

  // opts
  var socket = opts.socket;
  var host = opts.host || '127.0.0.1';
  var port = Number(opts.port || 6379);
  var pub = opts.pubClient;
  var sub = opts.subClient;
  var prefix = opts.key || 'socket.io';

  // init clients if needed
  if (!pub) pub = socket ? redis(socket) : redis(port, host);
  if (!sub) sub = socket
    ? redis(socket, { detect_buffers: true })
    : redis(port, host, {detect_buffers: true});


  // this server's key
  var uid = uid2(6);
  var key = prefix + '#' + uid;

  /**
   * Adapter constructor.
   *
   * @param {String} namespace name
   * @api public
   */

  function Redis(nsp){
    Adapter.call(this, nsp);
    this.channels = [];

    this.subscribe('entire-notice');
    sub.on('message', this.onmessage.bind(this));
  }

  /**
   * Inherits from `Adapter`.
   */

  Redis.prototype.__proto__ = Adapter.prototype;

  Redis.prototype.subscribe = function(channel){
    if(this.channels.indexOf(channel) == -1){
      this.channels.push(channel);
      sub.subscribe(channel);
    }

  };

  Redis.prototype.unsubscribe = function(channel){
    var index = this.channels.indexOf(channel);
    if(index > -1){
      this.channels.splice(index, 1);
      sub.unsubscribe(channel);
    }
  };
  
  /**
   * Called with a subscription message
   *
   * @api private
   */

  Redis.prototype.onmessage = function(channel, msg){
    // if (uid == pieces.pop()) return debug('ignore same uid');
    var args = msgpack.decode(msg);

    if (args[0] && args[0].nsp === undefined) {
      args[0].nsp = '/';
    }

    if (!args[0] || args[0].nsp != this.nsp.name) {
      return debug('ignore different namespace');
    }
    
    args.push(true);

    this.broadcast.apply(this, args);
  };

  /**
   * Broadcasts a packet.
   *
   * @param {Object} packet to emit
   * @param {Object} options
   * @param {Boolean} whether the packet came from another node
   * @api public
   */

  Redis.prototype.broadcast = function(packet, opts, remote){
    if (!remote) {
      if (opts.rooms === undefined ){
        Adapter.prototype.broadcast.call(this, packet, opts);
      }else{
        var room = packet.data[1].room;
        pub.publish(room, msgpack.encode([packet, opts]));
      }
    };
    if (remote) Adapter.prototype.broadcast.call(this, packet, opts);
  };

  return Redis;
}
