module.exports = function (stream, cb) {
    return new Parser(stream, cb);
};

function Parser (stream, cb) {
    var self = this;
    self.stream = stream;
    self.cb = cb;
    
    stream.on('data', function (buf) {
        self.execute(buf, 0, buf.length);
    });
    
    this.mode = 'begin';
}

Parser.prototype.execute = function (buf, start, len) {
    for (var i = start; i < len && i >= 0; ) {
        i = this.modes[this.mode].call(this, buf, i, len - i);
        if (i < 0) console.error('error parsing ' + this.mode);
    }
};

Parser.prototype.modes = require('./lib/modes');
