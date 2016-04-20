var sharedb = require('sharedb/lib/client');
var otText = require('ot-text');
var ShareDBDOMInput = require('..');

sharedb.types.map['json0'].registerSubtype(otText.type);

var textInput = document.querySelector('input[type="text"]');
var textarea = document.querySelector('textarea');

var socket = new WebSocket("ws://" + location.host);
var shareConnection = new sharedb.Connection(socket);

var doc = shareConnection.get('users', 'jane');

doc.subscribe(function(err) {
  if (err) {
    throw err;
  }

  if (!doc.type) {
    doc.create({valueA: '', valueB: ''});
  }

  attachDocFieldToElem(doc, 'valueA', textInput);
  attachDocFieldToElem(doc, 'valueB', textarea);
});

function attachDocFieldToElem(doc, key, elem) {
  var shareDBDOMInput = new ShareDBDOMInput(doc, elem, {
    key: key,
    verbose: true
  });

  elem.addEventListener('input', function() {
    shareDBDOMInput.handleChange();
  });

  shareDBDOMInput.start();
}
