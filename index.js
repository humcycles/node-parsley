var EventEmitter = require('events').EventEmitter;
var http = require('http');
var IncomingMessage = http.IncomingMessage;

module.exports = function (stream) {
    return new Parser(stream);
};

function Parser (stream) {
    var self = this;
    
    stream.on('data', function (buf) {
        self.execute(buf, 0, buf.length);
    });
    
    this.mode = 'begin';
    this.request = new IncomingMessage(stream);
}

Parser.prototype = new EventEmitter;

Parser.prototype.execute = function (buf, start, len) {
    for (var i = start; i < len && i >= 0; ) {
        i = this.modes[this.mode].call(this, buf, i, len - i);
    }
};

Parser.prototype.modes = require('./modes');
