const ChildProcess = require('child_process'),
      libpath      = require('path'),
      Blast        = __Protoblast,
      Obj          = Blast.Bound.Object,
      Fn           = Blast.Bound.Function,
      fs           = require('fs'),
      MC           = Fn.getNamespace('Develry.MediaConversion');

/**
 * The Output Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String|Stream}   target
 */
var Output = Fn.inherits('Develry.MediaConversion.MediaStream', function Output(target, parent) {

	// An id for debugging
	this.id = Blast.Classes.Crypto.uid();

	// Set input arguments
	this.arguments = {};

	// Optional extra argumants
	this.extra_arguments = [];

	// An informer for events
	this.events = new Blast.Classes.Informer();

	// Place to look for probeValues you can override
	this.override_probe_values = {};

	// Filter values (will all go in the "vf" argument)
	this.filters = {};

	if (parent) {
		this.parent = parent;
	}

	if (target) {
		this.setTarget(target);
	} else {
		this.setTarget(this);
	}

	Output.super.call(this);
});

/**
 * The parent MediaConversion instance
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Develry.MediaConversion.MediaConversion}
 */
Output.setProperty('parent', null);

/**
 * The pipe_number to use
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Number}
 */
Output.setProperty('pipe_number', null);

/**
 * Flag maps
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Object}
 */
Output.setProperty('flag_map', {});

/**
 * Flag names
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Object}
 */
Output.setProperty('flag_name', {});

/**
 * Boolean flags (can be set without argument)
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Object}
 */
Output.setProperty('bool_map', {});

/**
 * Name maps
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @type     {Object}
 */
Output.setProperty('name_map', {});

/**
 * Set a certain argument handler
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   name     The name of the argument
 * @param    {String}   flag     The flag to use in the command
 * @param    {Function} handler  The handler function
 *
 * @return   {this}
 */
Output.setStatic(function setArgument(name, flag, handler) {

	var classified = Blast.Bound.String.camelize(name),
	    prev_flag,
	    cur_flag,
	    flag_fnc;

	if (typeof flag == 'function') {
		flag_fnc = flag;
	}

	// Store in the name map
	this.prototype.name_map[name] = classified;

	if (typeof flag == 'string') {
		this.prototype.name_map[name] = classified;
		this.prototype.flag_name[flag] = name;
	}

	this.prototype.flag_map[name] = function getter(self, ...args) {
		return self['get' + classified](...args);
	};

	// Set the method that will set the argument value
	this.setMethod('set' + classified, function argSetter(...args) {

		var value;

		if (handler) {
			value = handler.apply(this, args);
		} else {
			value = args[0];
		}

		if (flag_fnc) {
			cur_flag = flag_fnc.call(this, value, ...args);
		} else {
			cur_flag = flag;
		}

		this.arguments[cur_flag] = value;

		return this;
	});

	// Set the method that will get the argument value
	this.setMethod('get' + classified, function argGetter(...args) {

		if (flag_fnc) {
			if (!cur_flag) {
				return null;
			}
		} else if (!cur_flag) {
			cur_flag = flag;
		}

		return this.arguments[cur_flag];
	});
});

/**
 * Set a certain argument that doesn't have any parameters
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   name     The name of the argument
 * @param    {String}   flag     The flag to use in the command
 *
 * @return   {this}
 */
Output.setStatic(function setFlagArgument(name, flag, handler) {

	this.prototype.bool_map[name] = true;
	this.prototype.bool_map[flag] = true;

	this.setArgument(name, flag, function setFlagValue(val) {

		if (handler) {
			val = handler.call(this, ...arguments);
		}

		if (val || arguments.length == 0) {
			return '';
		}

		return null;
	});
});

/**
 * Set many options
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Output.setMethod(function setMany(options) {

	var key;

	for (key in options) {
		this._setFlagOrName(key, options[key]);
	}
});

/**
 * Set many options
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Output.setMethod(function _setFlagOrName(key, value) {

	var classified,
	    method,
	    temp;

	classified = this.name_map[key];

	if (!classified) {
		classified = Blast.Bound.String.camelize(key);
	}

	method = 'set' + classified;

	if (!this[method]) {
		method = 'add' + classified;
	}

	if (!this[method]) {
		temp = this.flag_name[key];

		console.log(key, temp);

		if (temp) {
			return this._setFlagOrName(temp, value);
		}
	}

	if (!this[method]) {
		throw new Error('Unknown output option "' + key + '"');
	}

	if (!Array.isArray(value)) {
		this[method](value);
	} else {
		this[method](...value);
	}
});

/**
 * Add extra arguments
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @return   {this}
 */
Output.setMethod(function addArguments(...args) {

	var i;

	for (i = 0; i < args.length; i++) {
		this.extra_arguments.push(args[i]);
	}

	return this;
});

/**
 * Get the input arguments
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Output.setMethod(function getArguments(callback) {

	var that = this,
	    result = [],
	    key;

	this._makeReady(function isReady() {

		var filters = '',
		    value;

		// Do the filters first
		for (key in that.filters) {
			if (filters) {
				filters += ', ';
			}

			filters += key + '=' + that.filters[key];
		}

		// Do not allow copy when using filters
		if (filters) {
			that.allow_video_copy = false;
		}

		for (key in that.arguments) {
			value = that.arguments[key];

			if (value == null) {
				continue;
			}

			// If there is no valid value, make sure it's a bool map
			if (value == '') {
				if (!that.bool_map[key]) {
					continue;
				}
			}

			result.push('-' + key);

			// If we can use copy, do so!
			if (key == 'c:v' && that.allow_video_copy) {
				value = 'copy';
			}

			if (value != '') {
				result.push(value);
			}
		}

		if (filters) {
			result.push('-vf', filters);
		}

		result.push.apply(result, that.extra_arguments);

		callback(null, result);
	});
});

/**
 * Set the conversion profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @return   {this}
 */
Output.setMethod(function useProfile(name, options) {

	if (!this.parent) {
		throw new Error('Output does not have a parent, can not set profile');
	}

	let fnc = MC.MediaConversion.profiles[name];

	if (!fnc) {
		throw new Error('Profile "' + name + '" does not exist');
	}

	fnc.call(this.parent, this.parent.inputs[0], this);
});

/**
 * Get the input video codec
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Output.setMethod(function getInputVideoCodec(callback) {

	var that = this,
	    input = this.parent.inputs[0];

	input.probeVideoCodec(function gotCodec(err, codec) {

		if (err) {
			return callback(err);
		}

		callback(null, codec);
	});
});

/**
 * Get the input video
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Output.setMethod(function getInputVideo(callback) {

	var that = this;

	Blast.nextTick(function nextTick() {
		callback(null, that.parent.inputs[0]);
	});
});

/**
 * Look for a value
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Output.setMethod(function probeValue(name, callback) {

	var that = this,
	    value;

	Fn.series(function checkSelf(next) {

		if (that.override_probe_values[name]) {
			if (Blast.Classes.Pledge.isPledge(that.override_probe_values[name])) {
				that.override_probe_values[name].then(function gotValue(val) {
					value = val;
					next();
				});
			} else {
				value = that.override_probe_values[name];
				next();
			}

			return;
		}

		if (that.flag_map[name]) {
			value = that.flag_map[name](that);
		}

		next();
	}, function checkInput(next) {

		// DO NOT allow "copy" values,
		// they don't make sense
		if (value == 'copy') {
			value = null;
		}

		if (value != null) {
			return next();
		}

		if (!that.parent || !that.parent.inputs[0]) {
			return next();
		}

		that.parent.inputs[0].probeValue(name, function gotValue(err, val) {
			value = val;
			next(err);
		});
	}, function done(err) {
		callback(err, value);
	});
});

/**
 * Make ready
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Output.setMethod(function _makeReady(callback) {

	if (this._readying) {
		return this.events.afterOnce('ready', callback);
	}

	let that = this;

	this._readying = true;

	Fn.parallel(function doGetVC(next) {

		var need_framerate,
		    output_codec,
		    input_codec,
		    need_size,
		    input;

		Fn.series(false, function getInput(next) {
			that.getInputVideo(function gotVideo(err, _input) {
				input = _input;
				next(err);
			});
		}, function getCodec(next) {
			input.probeValue('video_codec', function gotCodec(err, _codec) {
				input_codec = _codec;
				next(err);
			});
		}, function checkCodec(next) {

			that.parent.getFormats(function gotFormats(err, formats, codecs) {

				if (err) {
					return next(err);
				}

				let entry;

				if (codecs[input_codec]) {
					entry = codecs[input_codec];

					if (entry.encoders && entry.encoders.length) {
						input_codec = entry.encoders[0];
					}
				}

				next();
			});
		}, function processCodec(next) {

			output_codec = that.getVideoCodec();

			if (input_codec == output_codec && that.allow_video_copy !== false) {
				that.allow_video_copy = true;
				return next();
			}

			if (output_codec == 'rawvideo') {
				if (!that.getPixelFormat()) {
					that.setPixelFormat('yuv420p');
				}

				if (!that.getVideoSize()) {
					need_size = true;
				}

				if (!that.getFramerate()) {
					need_framerate = true;
				}
			}

			next();

		}, function checkPixelFormat(next) {

			// If copy is already false, do nothing
			if (that.allow_video_copy === false) {
				return next();
			}

			let output_format = that.getPixelFormat();

			// If no pixel output format was set, no need to check either
			if (!output_format) {
				return next();
			}

			input.probeValue('pixel_format', function gotFormat(err, format) {

				if (err || format != output_format) {
					that.allow_video_copy = false;
				}

				next();
			});

		}, function checkSize(next) {

			if (!need_size) {
				return next();
			}

			input.probeValue('video_size', function gotSize(err, size) {

				if (err) {
					return next(err);
				}

				that.setVideoSize(size);
				next();
			});
		}, function checkRate(next) {

			if (!need_framerate) {
				return next();
			}

			input.probeValue('framerate', function gotRate(err, rate) {

				if (err) {
					return next(err);
				}

				that.setFramerate(rate);
				next();
			});
		}, next);
	}, function done(err) {

		if (err) {
			return callback(err);
		}

		that.events.emit('ready');
		callback();
	});
});

/**
 * Set the actual source
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   target
 *
 * @return   {this}
 */
Output.setMethod(function setTarget(target) {

	// Set the original target
	this.original_target = target;

	if (MC.isStream(target)) {
		this.target_stream = target;
	}

	return this;
});

/**
 * Destroy this output
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
Output.setMethod(function destroy() {

	if (this.parent) {
		this.parent.debug('Destroying output stream', this.id);
	}

	this.end();
});

/**
 * Set the output format
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   format
 */
Output.setArgument('format', 'f');

/**
 * Set the output framerate
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   fps
 */
Output.setArgument('framerate', 'r');

/**
 * Set an output filter
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   name
 * @param    {String}   value
 */
Output.setMethod(function setFilter(name, value) {
	this.filters[name] = value;
	return this;
});

/**
 * Get a set output filter
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   name
 * @param    {String}   value
 */
Output.setMethod(function getFilter(name) {
	return this.filters[name];
});

/**
 * Set the output resolution
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   resolution
 */
Output.setMethod(['setVideoSize', 'setResolution'], function setVideoSize(resolution) {
	handleResolution.call(this, resolution);
	return this;
});

/**
 * Get the set output resolution
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   resolution
 */
Output.setMethod(['getVideoSize', 'getResolution'], function getVideoSize() {
	if (this.override_probe_values.video_size) {
		return this.override_probe_values.video_size;
	}
});

/**
 * Resolution handler
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   resolution
 */
function handleResolution(resolution) {

	var pieces = resolution.split(/[:x]+/),
	    width  = pieces[0],
	    height = pieces[1];

	// Store this as the new video size!
	this.override_probe_values.video_size = resolution;

	// Add it to the filter list
	this.filters['scale'] = width + ':' + height;
}

/**
 * Set ratecontrol buffer size (in bits)
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Number}   integer
 */
Output.setArgument('bufsize', 'bufsize');

/**
 * Set the encoding preset
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   preset
 */
Output.setArgument('preset', 'preset');

/**
 * Set the encoding profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   profile
 */
Output.setArgument('profile', 'profile');

/**
 * Set the deadline
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   deadline
 */
Output.setArgument('deadline', 'deadline');

/**
 * Set the strictness
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Number}   value
 */
Output.setArgument('strict', 'strict');

/**
 * Disable the audio
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   val
 */
Output.setFlagArgument('disable_audio', 'an', function setDisableAudio(val) {

	if (val == null) {
		val = true;
	}

	if (val) {
		this.setAudioCodec(false);
	} else {
		this.setAudioCodec(null);
	}

	return val;
});

/**
 * Set the output duration
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Number|String}   duration
 */
Output.setArgument('duration', 't', function setDuration(duration) {

	// Numbers are seconds, strings are in the HH:MM:SS notation
	if (typeof duration == 'string') {
		if (!isNaN(duration)) {
			duration = Number(duration);
		}
	}

	return duration;
});

/**
 * Set the pixel format
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   format
 */
Output.setArgument('pixel_format', 'pix_fmt');

/**
 * Set the video codec
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   codec
 */
Output.setArgument('video_codec', 'c:v');

/**
 * Set the audio codec
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   codec
 */
Output.setArgument('audio_codec', 'c:a');

/**
 * Set the audio bsf
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {String}   codec
 */
Output.setArgument('audio_bfs', 'bsf:a');

/**
 * Set the video bitrate
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Number}   rate
 */
Output.setArgument('video_bitrate', 'b:v');

/**
 * Set the audio bitrate
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Number}   rate
 */
Output.setArgument('audio_bitrate', 'b:v');