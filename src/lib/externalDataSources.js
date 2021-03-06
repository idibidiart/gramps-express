import path from 'path';
import { EOL } from 'os';

let isUsingExternalData = false;

const getExternalSourcePaths = () => {
  const sources = process.env.GQL_DATA_SOURCES || '';

  return sources.split(',').map(s => s.trim());
};

const filterInvalidPath = sourcePath => sourcePath && sourcePath.length > 0;

const filterInvalidSource = source => source && source.context;

/**
 * Accepts a relative path and converts it to an absolute path.
 * @param  {string} relPath the relative path to a file
 * @return {string}         the absolute path to the file
 */
const getAbsolutePath = relPath => path.resolve(process.cwd(), relPath);

/**
 * This is a hack I’m not crazy about, but dynamic imports per the spec are
 * currently in stage 3 and return Promises, which would add significant
 * complexity here. And since it’s dev-only... #yolo
 * @param   {string} src the path to load the external data source
 * @returns {object}     the external data source
 */
const loadExternalSource = src => {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const source = require(src).default;

  // Update the top-level flag, then warn the user.
  isUsingExternalData = true;

  return source;
};

/**
 * We should _not_ be using external data sources in production. This function
 * complains if an app attempts to do so.
 * @param  {Array}  config.sources  an array of externally-loaded data sources
 * @param  {Object} config.logger   logger for outputting the warning
 * @return {void}
 */
const warnInProduction = ({ sources, logger }) => {
  // External data is development-only, so complain if it’s used in production.
  /* istanbul ignore next: this does not affect the app’s behavior */
  if (isUsingExternalData && process.env.NODE_ENV === 'production') {
    const externalSources = sources.reduce(
      (sourceList, source) => [...sourceList, source.context],
      [],
    );
    const errorMessage = [
      '======================================================================',
      '     ERROR: Do no use local GraphQL data sources in production.',
      '',
      `     External source(s): ${externalSources.join(', ')}`,
      '',
      '     See https://ibm.biz/graphql-data-source for details.',
      '======================================================================',
    ].join(EOL);

    logger.error(errorMessage);
  }
};

// Use the functions we just declared to identify and load any external sources.
export const loadDevDataSources = ({ logger }) => {
  const sources = getExternalSourcePaths()
    .filter(filterInvalidPath)
    .map(getAbsolutePath)
    .map(loadExternalSource)
    .filter(filterInvalidSource);

  if (sources.length > 0) {
    warnInProduction({ sources, logger });
  }

  return sources;
};

const getDataSourceContextArray = sources =>
  sources.reduce((arr, src) => [...arr, src.context], []);

const warnForOverrides = ({ overrides, logger }) => {
  if (!overrides.length) {
    return;
  }

  const message = [
    `${EOL}========================= WARNING ==========================`,
    `     Existing data sources have been overridden by`,
    `     development-only data sources. This WILL NOT work`,
    `     in production environments.`,
    ``,
    `     These data sources are running in dev-only mode:`,
    `     - ${overrides.join(`${EOL}     - `)}`,
    ``,
    `     Details: https://ibm.biz/graphql-data-source`,
    `============================================================${EOL}`,
  ];

  logger.warn(message.join(EOL));
};

export const overrideLocalSources = ({ sources, devSources, logger }) => {
  const overrides = getDataSourceContextArray(devSources);
  const notOverridden = sources.filter(src => !overrides.includes(src.context));

  warnForOverrides({ overrides, logger });

  return [...notOverridden, ...devSources];
};
