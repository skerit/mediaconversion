var Stream = require('stream'),
    Transform = Stream.Transform,
    util = require('util');

// Start-of-image sequence
var soi = new Buffer(2);
soi.writeUInt16LE(0xd8ff, 0);

// End-of-image sequence
var eoi = new Buffer(2);
eoi.writeUInt16LE(0xd9ff, 0);

/**
 * MjpegExtractor stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   options
 */
function MjpegExtractor(options) {

	// Call Transform constructor
	Transform.call(this, options);

	// Init buffer 
	this.buffer = null;
}

// Inherit Transform prototype
util.inherits(MjpegExtractor, Transform);

/**
 * Transform chunks
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
MjpegExtractor.prototype._transform = function _transform(chunk, encoding, done) {

	// If we already have some bytes, concat the new chunk to it
	if (this.buffer) {
		this.buffer = Buffer.concat([this.buffer, chunk]);
	} else {
		this.buffer = chunk;
	}

	this._searchForFrame();

	done();
};

/**
 * Search for frames in the current buffer content
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
MjpegExtractor.prototype._searchForFrame = function _searchForFrame() {

	var image,
	    start,
	    end;

	// If the buffer does not exist or is empty, do nothing
	if (!this.buffer || !this.buffer.length) {
		return;
	}

	// Look for a start index
	start = this.buffer.indexOf(soi);

	if (start == -1) {
		return;
	}

	// Drop everything in front of the start sequence
	if (start > 0) {
		this.buffer = this.buffer.slice(start);
	}

	// Look for the end index
	end = this.buffer.indexOf(eoi);

	// If there is no end sequence yet, return now
	if (end == -1) {
		return;
	}

	// Add 2 to the end, the length of the end-of-image sequence
	end += 2;

	// Get the image
	image = this.buffer.slice(0, end);

	// Remove it from the buffer
	this.buffer = this.buffer.slice(end);

	// Push the image out
	this.push(image);

	if (this.buffer.length) {
		// Read the buffer content again
		this._searchForFrame();
	} else {
		// Set buffer to null,
		// saves us a meaningless concat later
		this.buffer = null;
	}
};

module.exports = MjpegExtractor;