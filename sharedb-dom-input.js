var DOM_INPUT_SOURCE = 'ShareDBDOMInput';
var NONSTANDARD_NEWLINE_RE = /\r\n?/g;

function ShareDBDOMInput(doc, elem, options) {
  this.elem = elem;
  this.doc = doc;

  this.docKey = options.key;
  this.verbose = Boolean(options.verbose);

  this._started = false;
  this._docOpListener = this._handleDocOp.bind(this);
  this._lastValue = normalizeNewlines(elem.value);
}
module.exports = ShareDBDOMInput;

ShareDBDOMInput.prototype.start = function() {
  if (this._started) {
    return;
  }

  var value = this._getDocValue();
  this.elem.value = value;
  this._lastValue = value;

  this.doc.on('op', this._docOpListener);
  this._started = true;
};

ShareDBDOMInput.prototype.stop = function() {
  if (!this._started) {
    return;
  }
  this.doc.removeListener('op', this._docOpListener);
  this._started = false;
};

ShareDBDOMInput.prototype.handleChange = function() {
  if (!this._started) {
    if (this.verbose) {
      console.log('ShareDBDOMInput: ignoring change while not started');
    }
    return;
  }

  var lastValue = this._lastValue;
  var newValue = normalizeNewlines(this.elem.value);
  this._lastValue = newValue;

  var op = textOpForSingleContiguousEdit(lastValue, newValue);

  if (op.length < 1) {
    if (this.verbose) {
      console.log('ShareDBDOMInput: handleChange called, but no change in value detected');
    }
    return;
  }

  if (this.verbose) {
    console.log('ShareDBDOMInput: produced op', op);
  }

  this._lastValue = newValue;
  this.doc.submitOp([{p: [this.docKey], t: 'text', o: op}], DOM_INPUT_SOURCE);
};

ShareDBDOMInput.prototype._getDocValue = function() {
  return this.doc.data[this.docKey] || '';
};

ShareDBDOMInput.prototype._handleDocOp = function(ops, source) {
  if (source === DOM_INPUT_SOURCE) {
    if (this.verbose) {
      console.log('ShareDBDOMInput: skipping local op', ops);
    }
    return;
  }

  var verbose = this.verbose;
  var docKey = this.docKey;
  var docValue = this._getDocValue();

  var hasUntrackedOpOnField = ops.some(function(op) {
    return op.p && op.p[0] === docKey && (op.p.length !== 1 || op.t !== 'text');
  });

  if (hasUntrackedOpOnField && docValue !== this.elem.value) {
    if (verbose) {
      console.log(
        "ShareDBDOMInput: doc value changed by an untracked " +
        "operation; resetting input", ops);
    }

    this._setElemValueDisruptively(docValue);
    return;
  }

  var combinedTextOp = Array.prototype.concat.apply([],
    ops.map(function(op) {
      var isTextOpOnOurField =
        op.p && op.p.length === 1 && op.p[0] === docKey && op.t === 'text';

      if (!isTextOpOnOurField) {
        if (verbose) {
          console.log(
            "ShareDBDOMInput: skipping op because it's not a text " +
            "subtype op on our field", op);
        }

        return [];
      }

      if (verbose) {
        console.log('ShareDBDOMInput: received op', op);
      }

      return op.o;
    })
  );

  this._setElemValueAfterTextOp(docValue, combinedTextOp);
};

ShareDBDOMInput.prototype._setElemValueAfterTextOp = function(value, textOp) {
  var elem = this.elem;
  var origProps = {
    scrollTop:      elem.scrollTop,
    selectionStart: elem.selectionStart,
    selectionEnd:   elem.selectionEnd
  };

  elem.value = value;
  this._lastValue = value;

  if (elem.scrollTop !== origProps.scrollTop) {
    elem.scrollTop = origProps.scrollTop;
  }

  if (elem.ownerDocument.activeElement === elem) {
    elem.selectionStart = transformIndexByTextOp(origProps.selectionStart, textOp);
    elem.selectionEnd = transformIndexByTextOp(origProps.selectionEnd, textOp);
  }
};

ShareDBDOMInput.prototype._setElemValueDisruptively = function(value) {
  this.elem.value = value;
  this._lastValue = value;
};

function transformIndexByTextOp(index, textOp) {
  var opPosition = 0;

  for (var i = 0; i < textOp.length; i++) {
    var opPart = textOp[i];

    switch (typeof opPart) {
      case 'number':
        opPosition += opPart;
        break;
      case 'string':
        opPosition += opPart.length;
        index += opPart.length;
        break;
      case 'object': // {d: numChars}
        index = Math.max(opPosition, index - opPart.d);
        break;
    }

    if (opPosition >= index) {
      break;
    }
  }

  return index;
}

function commonPrefixLength(s1, s2) {
  var prefixLen = 0, s1Len = s1.length;

  while (prefixLen < s1Len && s1.charAt(prefixLen) === s2.charAt(prefixLen)) {
    prefixLen += 1;
  }

  return prefixLen;
}

function commonSuffixLength(s1, s2) {
  var suffixLen = 0, s1Len = s1.length, s2Len = s2.length;

  while (suffixLen < s1Len &&
          s1.charAt(s1Len - suffixLen - 1) === s2.charAt(s2Len - suffixLen - 1)) {
    suffixLen += 1;
  }

  return suffixLen;
}

function textOpForSingleContiguousEdit(fromString, toString) {
  var op = [];

  if (fromString === toString) {
    return op;
  }

  var prefixLen = commonPrefixLength(fromString, toString);

  var suffixLen = Math.min(
    fromString.length - prefixLen,
    toString.length - prefixLen,
    commonSuffixLength(fromString, toString));

  if (prefixLen > 0) {
    op.push(prefixLen);
  }

  var numRemoved = fromString.length - suffixLen - prefixLen;

  if (numRemoved > 0) {
    op.push({d: numRemoved});
  }

  var insertedText = toString.substring(prefixLen, toString.length - suffixLen);

  if (insertedText) {
    op.push(insertedText);
  }

  return op;
}

function normalizeNewlines(s) {
  return s.replace(NONSTANDARD_NEWLINE_RE, '\n');
}
