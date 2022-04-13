const { slice } = require('lodash');
var _ = require('lodash');
var pathToRegexp = require('path-to-regexp');

var swagger = {
	swagger	: "2.0",
	info	: {},
	paths	: {},
	definitions: {}
};

function toSwagger(apidocJson, projectJson) {
	swagger.info = addInfo(projectJson);
	swagger.paths = extractPaths(apidocJson);
	return swagger;
}

var tagsRegex = /(<([^>]+)>)/ig;
// Removes <p> </p> tags from text
function removeTags(text) {
	return text ? text.replace(tagsRegex, "") : text;
}

function addInfo(projectJson) {
	var info = {};
	info["title"] = projectJson.title || projectJson.name;
	info["version"] = projectJson.version;
	info["description"] = projectJson.description;
	return info;
}

/**
 * Extracts paths provided in json format
 * post, patch, put request parameters are extracted in body
 * get and delete are extracted to path parameters
 * @param apidocJson
 * @returns {{}}
 */
function extractPaths(apidocJson){
	var apiPaths = groupByUrl(apidocJson);

	var paths = {};
	for (var i = 0; i < apiPaths.length; i++) {
		var verbs = apiPaths[i].verbs;
		var url = verbs[0].url;
		if(url[0] != "/"){
			url = "/"+url;
		}
		var pattern = pathToRegexp(url, null);
		var matches = pattern.exec(url);

		// Surrounds URL parameters with curly brackets -> :email with {email}
		var pathKeys = [];
		for (var j = 1; j < matches.length; j++) {
			var key = matches[j].substr(1);
			url = url.replace(matches[j], "{"+ key +"}");
			pathKeys.push(key);
		}

		for(var j = 0; j < verbs.length; j++) {
			var verb = verbs[j];
			verb.type = verb.type.toLowerCase();
			var type = verb.type;

			var obj = paths[url] = paths[url] || {};

			if (type == 'post' || type == 'patch' || type == 'put' || type == 'delete') {
				_.extend(obj, createPostPushPutDeleteOutput(verb, swagger.definitions, pathKeys));
			} else {
				_.extend(obj, createGetOutput(verb, swagger.definitions, pathKeys));
			}
		}
	}
	return paths;
}

let isExample = false

function createPostPushPutDeleteOutput(verbs, definitions, pathKeys) {
	var pathItemObject = {};
	var verbDefinitionResult = createVerbDefinitions(verbs,definitions);


	var params = [];
	var pathParams = createPathParameters(verbs, pathKeys);

	pathParams = _.filter(pathParams, function(param) {
		var hasKey = pathKeys.indexOf(param.name) !== -1;
		return !(param.in === "path" && !hasKey)
	});

	params = params.concat(pathParams);
	var required = verbs.parameter && verbs.parameter.fields && 
					verbs.parameter.fields.Parameter && verbs.parameter.fields.Parameter.length > 0;
	if(verbs?.parameter?.fields?.Parameter?.length > 0){
		params.push({
			"name": "body",
			"in": "body",
			"description": removeTags(verbs.description),
			"required": required,
			"schema": {
				"$ref": "#/definitions/" + verbDefinitionResult.topLevelParametersRef
			}
		});
	}
	pathItemObject[verbs.type] = {
		tags: [verbs.group],
		summary: removeTags(verbs.description),
		consumes: [
			"application/json"
		],
		produces: [
			"application/json"
		],
		parameters: params
	}

	if (verbDefinitionResult.topLevelSuccessRef) {
		var schema = {}
		var ref = "#/definitions/" + verbDefinitionResult.topLevelSuccessRef;
		var type = verbDefinitionResult.topLevelSuccessRefType.toLowerCase();
		var typeIndex = type.indexOf("[]");

		if(typeIndex !== -1 ){
			schema.type = "array";
			schema.items = {
				//todo, make sure the type gets moved into the ref
				//type: type.slice(0, type.length-2).toLowerCase(),
				"$ref": ref
			}
		} else {
			//todo, make sure the type gets moved into the ref
			schema["$ref"] = ref;

		}
		pathItemObject[verbs.type].responses = {
          "200": {
            "description": "successful operation",
            "schema": schema
          }
      	};
	} else {
		pathItemObject[verbs.type].responses = {
			"200": {
				"description": "Success"
			}
		}
	};
	
	return pathItemObject;
}

function createVerbDefinitions(verbs, definitions) {
	var result = {
		topLevelParametersRef : null,
		topLevelSuccessRef : null,
		topLevelSuccessRefType : null
	};
	var defaultObjectName = verbs.name;

	var fieldArrayResult = {};
	if (verbs && verbs.parameter && verbs.parameter.fields) {
		fieldArrayResult = createFieldDefinitions(verbs.parameter.fields.Parameter, definitions, verbs.name, defaultObjectName + "Request");
		result.topLevelParametersRef = fieldArrayResult.topLevelRef;
	};

	if (verbs && verbs.success && verbs.success.fields) {
		fieldArrayResult = createFieldDefinitions(verbs.success.fields["Success 200"], definitions, verbs.name, defaultObjectName);
		result.topLevelSuccessRef = defaultObjectName;
		result.topLevelSuccessRefType = fieldArrayResult.topLevelRefType;
	};

	return result;
}

function formatAllowedValues(values) {
    return values.map((value) =>value.replace(/[^a-z0-9]/gi, ''));
}

function createFieldDefinitions(fieldArray, definitions, topLevelRef, defaultObjectName){
	var result = {
		topLevelRef : topLevelRef,
		topLevelRefType : null
	}

	if (!fieldArray) {
		return result;
	}

	for (var i = 0; i < fieldArray.length; i++) {
		var parameter = fieldArray[i];

		var nestedName = createNestedName(parameter.field);
		//var objectName = nestedName.objectName;
		// if (!objectName) {
		// 	objectName = defaultObjectName;
		// }
		var objectName = defaultObjectName;
		var type = parameter.type;
		if (i == 0) {
			result.topLevelRefType = type;
			if(parameter.type == "Object") {
				//objectName = nestedName.propertyName;
				nestedName.propertyName = null;
			} else if (parameter.type == "Array") {
				//objectName = nestedName.propertyName;
				nestedName.propertyName = null;
				result.topLevelRefType = "array";
			}
			result.topLevelRef = objectName;
			if(true){
				definitions[objectName] = definitions[objectName] ||
					{ properties : {} };
			}
		};


		if (nestedName.propertyName) {
			var nestedNameProperties = parameter.field.split(".");
			var definition = definitions[defaultObjectName];
			let propertyName;
			for (var j = 0; j < nestedNameProperties.length; j++){
				propertyName = nestedNameProperties[j];
				if (definition == undefined){
					definition = { properties: {}};
				}
				if (definition.items != undefined){
					definition = definition.items
				}
				if (definition.properties == undefined){
					definition.properties = {};
				}
				if(definition.properties[propertyName] == undefined){
					definition.properties[propertyName] = {};
				}
				if(j < nestedNameProperties.length - 1){
					definition = definition.properties[propertyName];
				}
			}

            if (parameter.allowedValues) {
                definition.properties[propertyName].enum = formatAllowedValues(parameter.allowedValues);
            }

			definition.properties[propertyName].type = (parameter.type || "").toLowerCase();
			if(definition.properties[propertyName].type == "bool"){
				definition.properties[propertyName].type =  "boolean";
			}
			if(definition.properties[propertyName].type == "int"){
				definition.properties[propertyName].type = "integer";
			}
			if(definition.properties[propertyName].type == "float64"){
				definition.properties[propertyName].type = "number";
				definition.properties[propertyName].format = "float"
			}
			if(definition.properties[propertyName].type == "datetime"){
				definition.properties[propertyName].type = "string";
				definition.properties[propertyName].format = "date-time"
			}
			definition.properties[propertyName].description = removeTags(parameter.description);

			if (type !== undefined) {
				var typeIndex = type.indexOf("[]");
				if(typeIndex !== -1) {
					definition.properties[propertyName].type = "array";
					definition.properties[propertyName].items = {};

					definition.properties[propertyName].items.type = type.replace("[]","").toLowerCase()
					if(definition.properties[propertyName].items.type == "bool"){
						definition.properties[propertyName].items.type =  "boolean"
					}
				}
			}

			if (!parameter.optional) {
				var arr = definition['required'];
				//  Make required only exist when there are required elements
				if( arr == undefined )
				{
					definition['required'] = [];
					arr = definition['required'];
				}
				if(arr.indexOf(nestedName.propertyName) === -1) {
					arr.push(nestedName.propertyName);
				}
			};

		};
	}

	return result;
}
function createFieldArrayDefinitions(fieldArray, definitions, topLevelRef, defaultObjectName) {
	var result = {
		topLevelRef : topLevelRef,
		topLevelRefType : null
	}

	if (!fieldArray) {
		return result;
	}

	for (var i = 0; i < fieldArray.length; i++) {
		var parameter = fieldArray[i];

		var nestedName = createNestedName(parameter.field);
		var objectName = nestedName.objectName;
		if (!objectName) {
			objectName = defaultObjectName;
		}
		var type = parameter.type;
		if (i == 0) {
			result.topLevelRefType = type;
			if(parameter.type == "Object") {
				objectName = nestedName.propertyName;
				nestedName.propertyName = null;
			} else if (parameter.type == "Array") {
				objectName = nestedName.propertyName;
				nestedName.propertyName = null;
				result.topLevelRefType = "array";
			}
			result.topLevelRef = objectName;
		};

		definitions[objectName] = definitions[objectName] ||
			{ properties : {} };

		if (nestedName.propertyName) {

			var prop = definitions[objectName]['properties'][nestedName.propertyName]
			if (!prop){
				prop = {}
			}
			if(parameter.type == "Object") {
				prop.$ref = "#/definitions/" + parameter.field;
			} else {
				prop.type = (parameter.type || "").toLowerCase();
				prop.description = removeTags(parameter.description);
			}

			if (type !== undefined) {
				var typeIndex = type.indexOf("[]");
				if(typeIndex !== -1 && typeIndex === (type.length - 2)) {
					prop.type = "array";
					prop.items = {};
					if (type == "Object[]"){
						prop.items.$ref = "#/definitions/" + parameter.field
					} else {
						prop.items.type = type.slice(0, type.length-2).toLowerCase()
					}
				}
			}

			definitions[objectName]['properties'][nestedName.propertyName] = prop;
			if (!parameter.optional) {
				var arr = definitions[objectName]['required'];
				//  Make required only exist when there are required elements
				if( arr == null )
				{
					definitions[objectName]['required'] = [];
					arr = definitions[objectName]['required'];
				}
				if(arr.indexOf(nestedName.propertyName) === -1) {
					arr.push(nestedName.propertyName);
				}
			};

		};
	}

	return result;
}

function createNestedName(field) {
	var propertyName = field;
	var objectName;
	var propertyNames = field.split(".");
	if(propertyNames && propertyNames.length > 1) {
		propertyName = propertyNames[propertyNames.length-1];
		propertyNames.pop();
		objectName = propertyNames.join(".");
	}

	return {
		propertyName: propertyName,
		objectName: objectName
	}
}

/**
 * Generate get, delete method output
 * @param verbs
 * @returns {{}}
 */
function createGetOutput(verbs,definitions, pathKeys) {
	var pathItemObject = {};
	verbs.type = verbs.type === "del" ? "delete" : verbs.type;

	var verbDefinitionResult = createVerbDefinitions(verbs,definitions);
	pathItemObject[verbs.type] = {
		tags: [verbs.group],
		summary: removeTags(verbs.description),
		consumes: [
			"application/json"
		],
		produces: [
			"application/json"
		],
		parameters: createPathParameters(verbs, pathKeys)
	}
	if (verbDefinitionResult.topLevelSuccessRef) {
		pathItemObject[verbs.type].responses = {
          "200": {
            "description": "successful operation",
            "schema": {
				"$ref": "#/definitions/" + verbDefinitionResult.topLevelSuccessRef
            }
          }
      	};
	} else {
		pathItemObject[verbs.type].responses = {
			"200": {
				"description": "Success"
			}
		}
	};
	if(verbs?.success?.examples){
		var c = verbs.success.examples[0].content;
		var value = c.slice(c.indexOf("{"), c.length);
		try{
			value = eval(value);
		}
		catch(e){
		}
		pathItemObject[verbs.type].responses["200"].examples = {
			[verbs.success.examples[0].title]: {
				value: value
		}
		}
	}
	return pathItemObject;
}

/**
 * Iterate through all method parameters and create array of parameter objects which are stored as path parameters
 * @param verbs
 * @returns {Array}
 */
function createPathParameters(verbs, pathKeys) {
	pathKeys = pathKeys || [];

	var pathItemObject = [];
	if(verbs.parameter && !verbs.parameter.fields ){
		throw new Error('"{' +verbs.type+ "} " + verbs.url + " " + verbs.title + '" Has parameter defined without required fields.');
	}

	if (verbs.parameter && verbs.parameter.fields && verbs.parameter.fields.Parameter) {

		for (var i = 0; i < verbs.parameter.fields.Parameter.length; i++) {
			var param = verbs.parameter.fields.Parameter[i];
			var field = param.field;
			var type = param.type !== undefined ? param.type : '';
			var fieldIn = "path";
			if (type === "file"){
				type = "formData"
			} else if (!pathKeys.includes(field) && verbs.type == "get" ){
				fieldIn = "query";
			}

            const fields = {
				name: field,
				in: fieldIn,
				required: !param.optional,
				type: type.toLowerCase(),
				description: removeTags(param.description)     
            }
            
            if (param.allowedValues) {
                pathItemObject.enum = formatAllowedValues(param.allowedValues);
            }
			
            pathItemObject.push(fields);

		}
	}
	if (verbs.query) {
		for (var i = 0; i < verbs.query.length; i++) {
			var queryParam = verbs.query[i];
			var field = queryParam.field;
			var type = queryParam.type !== undefined ? queryParam.type : '';
			pathItemObject.push({
				name: field,
				in: "query",
				required: !queryParam.optional,
				type: type.toLowerCase(),
				description: removeTags(queryParam.description)
			});
		}
	}
	return pathItemObject;
}

function groupByUrl(apidocJson) {
	return _.chain(apidocJson)
		.groupBy("url")
		.toPairs()
		.map(function (element) {
			return _.zipObject(["url", "verbs"], element);
		})
		.value();
}

module.exports = {
	toSwagger: toSwagger
};
