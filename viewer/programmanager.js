/*
 * Keeps track of all the programs and positions
 * 
 * In the future, an obvious next step would be to auto-generate at least the vertex shaders 
 * based on some templates, at the moment the shaders are all written manually, using a naming scheme file the file names
 * 
 */

export default class ProgramManager {
	constructor(gl, viewerBasePath) {
		this.gl = gl;
		this.viewerBasePath = viewerBasePath;
		this.loadedFiles = new Map();
		this.programs = {};
		this.promises = [];
	}

	generateSetup(inputSettings) {
		var settings = {
			attributes: [],
			uniforms: []
		};
		if (inputSettings.specialType == "line") {
			return settings;
		}
		if (inputSettings.instancing) {
			settings.attributes.push("instanceMatrices");
			settings.attributes.push("instanceNormalMatrices");
			if (inputSettings.picking) {
				settings.attributes.push("instancePickColors");
			}
		}
		if (!inputSettings.picking) {
			if (inputSettings.useObjectColors) {
				settings.uniforms.push("objectColor");
				settings.uniforms.push("objectPickColor");
			} else {
				settings.attributes.push("vertexColor");
			}			
		}
		if (inputSettings.quantizeNormals) {
			// Has no effect on locations
		}
		if (inputSettings.quantizeVertices) {
			settings.uniforms.push("vertexQuantizationMatrix");
		}
		return settings;
	}

	load() {
		var defaultSetup = {
			attributes: [
				"vertexPosition",
				"vertexNormal"
				],
			uniforms: [
				"projectionMatrix",
				"viewNormalMatrix",
				"viewMatrix"
			],
			uniformBlocks: [
				"LightData"
			]
		};
		var defaultSetupForPicking = {
			attributes: [
				"vertexPosition",
				"vertexPickColor"
				],
			uniforms: [
				"projectionMatrix",
				"viewMatrix"
				],
			uniformBlocks: [
			]
		};

		// These 4 loops basically generate all 16 drawing combinations
		{
			let picking = false;
			for (var instancing of [true, false]) {
				for (var useObjectColors of [true, false]) {
					for (var quantizeNormals of [true, false]) {
						for (var quantizeVertices of [true, false]) {
							if (useObjectColors) {
								this.generateShaders(defaultSetup, settings, picking, instancing, useObjectColors, quantizeNormals, quantizeVertices, false);
							} else {
								for (var quantizeColors of [true, false]) {
									this.generateShaders(defaultSetup, settings, picking, instancing, useObjectColors, quantizeNormals, quantizeVertices, quantizeColors);
								}
							}
						}
					}
				}
			}
		}

		var settings = {
			specialType: "line"
		};
		this.setupProgram(this.viewerBasePath + "shaders/vertex_line.glsl", this.viewerBasePath + "shaders/fragment_line.glsl", {
			attributes: ["vertexPosition"],
			uniforms: [
				"matrix",
				"inputColor",
				"projectionMatrix",
				"viewMatrix"
			]
		}, this.generateSetup(settings), settings);

        //  Picking shaders - 8 combinations
		{
			let picking = true;
			let quantizeColors = false;
			let quantizeNormals = false;
			for (var instancing of [true, false]) {
				for (var useObjectColors of [true, false]) {
					for (var quantizeVertices of [true, false]) {
						if (useObjectColors) {
							this.generateShaders(defaultSetupForPicking, settings, picking, instancing, useObjectColors, quantizeNormals, quantizeVertices, quantizeColors);
						} else {
							this.generateShaders(defaultSetupForPicking, settings, picking, instancing, useObjectColors, quantizeNormals, quantizeVertices, quantizeColors);
						}
					}
				}
			}
		}

        return Promise.all(this.promises);
	}
	
	generateShaders(defaultSetup, settings, picking, instancing, useObjectColors, quantizeNormals, quantizeVertices, quantizeColors) {
		var settings = {
			picking: picking,
			instancing: instancing,
			useObjectColors: useObjectColors,
			quantizeNormals: quantizeNormals,
			quantizeVertices: quantizeVertices,
			quantizeColors: quantizeColors
		};
		var vertexShaderName = this.getVertexShaderName(settings);
		var fragShaderName = picking ? "shaders/fragment_pk.glsl" : "shaders/fragment.glsl";
		this.setupProgram(this.viewerBasePath + vertexShaderName, this.viewerBasePath + fragShaderName, defaultSetup, this.generateSetup(settings), settings);
	}

	getVertexShaderName(settings) {
		return "shaders/vertex_all.glsl";
	}

	getProgram(settings) {
		this.programNames = this.programNames || {};
		var vertexShaderName = this.getVertexShaderName(settings);
		if (!this.programNames[vertexShaderName]) {
			console.log("getProgram(..) -> " + vertexShaderName);
			this.programNames[vertexShaderName] = true;
		}

		var program = this.programs[JSON.stringify(settings)];
		if (program == null) {
			console.error("Program not found", settings);
		}
		return program;
	}

	setProgram(settings, program) {
		//console.log("setProgram('" + JSON.stringify(settings) + "', program");
		this.programs[JSON.stringify(settings)] = program;
	}

	setupProgram(vertexShader, fragmentShader, defaultSetup, specificSetup, settings) {
		var p = new Promise((resolve, reject) => {
			this.loadShaderFile(vertexShader).then((vsSource) => {
				this.loadShaderFile(fragmentShader).then((fsSource) => {
					var shaderProgram = this.initShaderProgram(this.gl, vertexShader, vsSource, fragmentShader, fsSource, settings);

					var programInfo = {
						program: shaderProgram,
						attribLocations: {},
						uniformLocations: {},
						uniformBlocks: {}
					};

					//console.log("----------------------------------------");
					//console.log("setupProgram (" + vertexShader + ", " + fragmentShader + ")");

					for (var setup of [defaultSetup, specificSetup]) {
						if (setup.attributes != null) {
							//console.log("attributes:");
							for (var attribute of setup.attributes) {
								programInfo.attribLocations[attribute] = this.gl.getAttribLocation(shaderProgram, attribute);
								// if (programInfo.attribLocations[attribute] == -1) {
								// 	console.error("Missing attribute location", attribute, vertexShader);
								// }
								//console.log("attribute  '" + attribute + "' = " + programInfo.attribLocations[attribute]);
							}
						}
						if (setup.uniforms != null) {
							//console.log("uniforms:");
							for (var uniform of setup.uniforms) {
								programInfo.uniformLocations[uniform] = this.gl.getUniformLocation(shaderProgram, uniform);
								if (programInfo.uniformLocations[uniform] == -1) {
									//console.error("Missing uniform location", uniform, vertexShader);
								}
								//console.log("uniform '" + uniform + "' = " + programInfo.uniformLocations[uniform]);
							}
						}
						if (setup.uniformBlocks != null) {
							if (setup.uniformBlocks != null) {
								for (var uniformBlock of setup.uniformBlocks) {
									programInfo.uniformBlocks[uniformBlock] = this.gl.getUniformBlockIndex(shaderProgram, uniformBlock);
									if (programInfo.uniformBlocks[uniformBlock] == -1) {
										//console.log("Missing uniformBlock '" + uniformBlock + "' = " + programInfo.uniformBlocks[uniformBlock]);
									} else {
										this.gl.uniformBlockBinding(shaderProgram, programInfo.uniformBlocks[uniformBlock], 0);
									}
								}
							}
						}
					}
					
					programInfo.vertexShaderFile = vertexShader;
					programInfo.fragmentShaderFile = fragmentShader;

					this.setProgram(settings, programInfo);

					resolve(programInfo);
				});
			});
		});

		this.promises.push(p);

		return p;
	}

	loadShaderFile(filename) {
		if (this.loadedFiles.has(filename)) {
			return this.loadedFiles.get(filename);
		}
		var promise = new Promise((resolve, reject) => {
			var request = new XMLHttpRequest();
			request.open("GET", filename, true);
			request.addEventListener("load", () => {
				resolve(request.responseText);
			});
			request.send();
		});
		this.loadedFiles.set(filename, promise);
		return promise;
	}

	initShaderProgram(gl, vsName, vsSource, fsName, fsSource, settings) {
		const vertexShader = this.loadShader(gl, gl.VERTEX_SHADER, vsName, vsSource, settings);
		const fragmentShader = this.loadShader(gl, gl.FRAGMENT_SHADER, fsName, fsSource, settings);

		const shaderProgram = gl.createProgram();
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);

		if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
			console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
			return null;
		}

		return shaderProgram;
	}

	loadShader(gl, type, name, source, options) {
		var fullSource = "#version 300 es\n\n";
		for (const opt in (options || {})) {
			if(options[opt]) {
				fullSource += `#define WITH_${opt.toUpperCase()}\n`;
			}
		}
		fullSource += "\n" + source;
		const shader = gl.createShader(type);
		gl.shaderSource(shader, fullSource);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error(name);
			console.error(fullSource);
			console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}
}