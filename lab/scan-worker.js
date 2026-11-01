/* Runs lab/scan.js off the main thread for big packages (see scanAsync in scan.js).
 * Browser: a Web Worker. Node: a worker_threads Worker (the test suite uses it).
 * Both send back the same object scan() returns. */
(function () {
  'use strict';
  if (typeof importScripts === 'function') {
    self.onmessage = e => {
      importScripts('./scan.js');
      self.postMessage(self.ZylithScan.scan(new Map(e.data.files), e.data.opts));
    };
  } else {
    const { parentPort, workerData } = require('worker_threads');
    const { scan } = require('./scan.js');
    parentPort.postMessage(scan(new Map(workerData.files), workerData.opts));
  }
})();
