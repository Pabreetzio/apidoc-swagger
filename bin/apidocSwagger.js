#!/usr/bin/env node

'use strict';

/*
 * apidoc-swagger
 *
 * Copyright (c) 2015 Exact
 * Author Bahman Fakhr Sabahi <bahman.sabahi@exact.com>
 * Licensed under the MIT license.
 */

var path   = require('path');
const { program } = require('commander');
const pkgjson = require(path.join('..', 'package.json'));
var apidocSwagger = require('../lib/index');

program
    .option('-f, --file-filters <file-filters>',
        'RegEx-Filter to select files that should be parsed (multiple -f can be used).',
        '.*\\.(clj|coffee|cs|dart|erl|go|java|scala|js|php?|py|rb|ts|pm)$')

    .option('-e, --exclude-filters <exclude-filters...>',
        'RegEx-Filter to select files / dirs that should not be parsed (many -e can be used).',
        '')

    .option('-i, --input <input>', 'Input / source dirname.', './')

    .option('-o, --output <output>', 'Output dirname.', './doc/')

    .option('-v, --verbose','Verbose debug output.',false)

    .option('-h, --help', 'Show this help information.')

    .option('--debug', 'Show debug messages.', false)

    .option('--color', 'Turn off log color.', true)

    .option('--parse', 'Parse only the files and return the data, no file creation.', false)

    .option('--parse-filters', 'Optional user defined filters. Format name=filename')
    .option('--parse-languages', 'Optional user defined languages. Format name=filename')
    .option('--parse-parsers'  , 'Optional user defined parsers. Format name=filename')
    .option('--parse-workers'  , 'Optional user defined workers. Format name=filename')

    .option('--silent', 'Turn all output off.', false)

    .option('--simulate', 'Execute but not write any file.', false)

    // markdown settings
    .option('markdown', 'Turn off markdown parser.', true);
program.parse(process.argv);
var argv = program.opts();
/**
 * Transform parameters to object
 *
 * @param {String|String[]} filters
 * @returns {Object}
 */
function transformToObject(filters) {
    if ( ! filters)
        return;

    if (typeof(filters) === 'string')
        filters = [ filters ];

    var result = {};
    filters.forEach(function(filter) {
        var splits = filter.split('=');
        if (splits.length === 2) {
            var obj = {};
            result[splits[0]] = path.resolve(splits[1], '');
        }
    });
    return result;
}
var options = {
    excludeFilters: argv['excludeFilters'],
    includeFilters: argv['fileFilters'],
    src           : argv['input'],
    dest          : argv['output'],
    verbose       : argv['verbose'],
    debug         : argv['debug'],
    parse         : argv['parse'],
    colorize      : argv['color'],
    filters       : transformToObject(argv['parseFilters']),
    languages     : transformToObject(argv['parseLanguages']),
    parsers       : transformToObject(argv['parseParsers']),
    workers       : transformToObject(argv['parseWorkers']),
    silent        : argv['silent'],
    simulate      : argv['simulate'],
    markdown      : argv['markdown']
};

if(options.verbose) {
    const asciiArt = `
              _     _                                                         
   __ _ _ __ (_) __| | ___   ___      _____      ____ _  __ _  __ _  ___ _ __ 
  / _\` | '_ \\| |/ _\` |/ _ \\ / __|____/ __\\ \\ /\\ / / _\` |/ _\` |/ _\` |/ _ \\ '__|
 | (_| | |_) | | (_| | (_) | (_|_____\\__ \\\\ V  V / (_| | (_| | (_| |  __/ |   
  \\__,_| .__/|_|\\__,_|\\___/ \\___|    |___/ \\_/\\_/ \\__,_|\\__, |\\__, |\\___|_|   
       |_|                                              |___/ |___/   v${pkgjson.version}        
    `;
    console.info(asciiArt);
}
if (apidocSwagger.createApidocSwagger(options) === false) {
    process.exit(1);
}
