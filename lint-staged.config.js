export default {
  '*.{js,ts,json,md}': ['prettier --write --no-error-on-unmatched-pattern'],
  '*': () => ['knip', 'knip --production'],
};
