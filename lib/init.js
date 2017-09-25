var libpath = require('path'),
    fs = require('fs'),
    old_blast;

// Store old protoblast version
if (typeof __Protoblast != 'undefined') {
	old_blast = __Protoblast;
}

global.__Protoblast = require('protoblast')(false);

// Require protoblast (without native mods) if it isn't loaded yet

// Get the MediaConversion namespace
const MediaConversion = __Protoblast.Bound.Function.getNamespace('Develry.MediaConversion');

// Require the main files
require('./media_conversion');
require('./media_stream');
require('./stream_multiplier');
require('./probe');
require('./input');
require('./output');

// If there was another protoblast version, restore it
if (old_blast) {
	global.__Protoblast = old_blast;
}

module.exports = MediaConversion;