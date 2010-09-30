//uncomment the following when this file becomes a module
//var EXPORTED_SYMBOLS = [ "BiDiMailUI" ];

if ("undefined" == typeof(BiDiMailUI)) {
  var BiDiMailUI = {};
};

#ifdef DEBUG
// The following enables logging messages to the javascript console:
BiDiMailUI.__defineGetter__("JSConsoleService", function() {
  delete BiDiMailUI.JSConsoleService;
  return BiDiMailUI.JSConsoleService =
    Components.classes['@mozilla.org/consoleservice;1']
              .getService(Components.interfaces.nsIConsoleService);
  });
#endif

// localized strings
BiDiMailUI.__defineGetter__("Strings", function() {
  delete BiDiMailUI.Strings;
  return BiDiMailUI.Strings =
    Components.classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService)
      .createBundle("chrome://bidimailpack/locale/bidimailpack.properties");
  });

BiDiMailUI.__defineGetter__("UnicodeConverter", function() {
  delete BiDiMailUI.UnicodeConverter;
  return BiDiMailUI.UnicodeConverter =
    Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
      .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
});

//---------------------------------------------------------

// General-purpose Javascript stuff

BiDiMailUI.JS = {

  // number to hexadecimal representation
  hexDigits : "0123456789ABCDEF",

  num2hex : function(num) {
    var hexString = BiDiMailUI.JS.hexDigits.substr(num & 15, 1);
    while(num > 15) {
      num >>= 4;
      hexString = BiDiMailUI.JS.hexDigits.substr(num & 15, 1) + hexString;
    }
    return hexString;
  },

#ifdef DEBUG
  stringToScanCodes : function(str) 
  {
    if (str == null)
      return null;
    var scanCodesString = "";
    for(var i = 0; i < str.length; i++) {
      scanCodesString += BiDiMailUI.JS.num2hex(str.charCodeAt(i)) + " ";  
    }
    return scanCodesString;
  },
#endif
}

//---------------------------------------------------------

// Preferences

BiDiMailUI.Prefs = {

  // const
  preferencePrefix : "bidiui.mail.",

  _prefService: null,

  get prefService()
  {
    if (!this._prefService) 
      this._prefService =
        Components.classes["@mozilla.org/preferences-service;1"]
                  .getService(Components.interfaces.nsIPrefBranch);
    return this._prefService;
  },

  getBoolPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getBoolPref(
        BiDiMailUI.Prefs.preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  getCharPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getCharPref(
        BiDiMailUI.Prefs.preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  getIntPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getIntPref(
        BiDiMailUI.Prefs.preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  setBoolPref: function(prefName, val) {
    this.prefService.setBoolPref(
      BiDiMailUI.Prefs.preferencePrefix + prefName, val);
  },

  setCharPref: function(prefName, val) {
    this.prefService.setCharPref(
      BiDiMailUI.Prefs.preferencePrefix + prefName, val);
  },

  setIntPref: function(prefName, val) {
    this.prefService.setIntPref(
      BiDiMailUI.Prefs.preferencePrefix + prefName, val);
  },
  
}

//---------------------------------------------------------

// Some regexp string constants

BiDiMailUI.RegExpStrings = {};
BiDiMailUI.RegExpStrings.MISDETECTED_RTL_CHARACTER =
  "[\\xBF-\\xD6\\xD8-\\xFF]";
BiDiMailUI.RegExpStrings.MISDETECTED_RTL_SEQUENCE =
  BiDiMailUI.RegExpStrings.MISDETECTED_RTL_CHARACTER + "{2,}";
  
// TODO: some of these are only relevant for UTF-8 misdecoded as windows-1252 
// (or iso-8859-1; mozilla cheats and uses windows-1252), while some of these
// are only relevant for UTF-8 misdecoded as windows-1255

// Rationale: Since we know that this message is a misdecoded RTL-codepage
// message, we assume that every text field with a misdetected RTL 'word' has
// no non-windows-1255 chars and hence can be recoded (plus we relaxed the
// definition of a word)
//
// TODO: I would like to use \b's instead of the weird combination here,
// but for some reason if I use \b's, I don't match the strings EE E4 20 and
// E7 E3 22 F9 
BiDiMailUI.RegExpStrings.CODEPAGE_MISDETECTION_SEQUENCE =
  BiDiMailUI.RegExpStrings.MISDETECTED_RTL_CHARACTER +
  "{3,}" + "|" +  "(" + "(\\s|\"|\W|^)" +
  BiDiMailUI.RegExpStrings.MISDETECTED_RTL_CHARACTER +
  "{2,}(\"|\\s|\W|$)" + ")";

// TODO: maybe it's better to undecode first, then check whether it's UTF-8;
// that will probably allow using a char range instead of so many individual
// chars
BiDiMailUI.RegExpStrings.MISDETECTED_UTF8_SEQUENCE =
  // Hebrew
  "(\\xD7([ \\u017E\\u0152\\u0153\\u02DC\\u2013-\\u2022\\u203A\\u2220\\u2122\\u0090-\\u00BF]|&#65533;) ?\"?){3}" +
  "|" + 
  // Arabic
  "((\\xD8[\\x8C-\\xBF])|(\\xD9[\\x80-\\xB9])|(\\xEF\\xAD[\\x90-\\xBF])|(\\xEF[\\xAE-\\xBA][\\x80-\\xBF])|(\\xEF\\xBB[\\x80-\\xBC])){3}" +
  "|" + 
  "\\uFFFD{3,}" +
  "|" + 
  "\\u00EF\\u00BB\\u00BF" + // UTF-8 BOM octets
  "|" +
  "(\\u05F3[\\u2018-\\u2022\\xA9]){2}";
   
BiDiMailUI.performCorrectiveRecoding = function (
  correctiveRecordingParams) {
#ifdef DEBUG_performCorrectiveRecoding
  BiDiMailUI.JSConsoleService.logStringMessage(
    '---------------------------------\nin performCorrectiveRecoding(' + 
    correctiveRecordingParams.preferredCharset + ', ' +
    correctiveRecordingParams.mailnewsDecodingType + ", " +
    "correctiveRecordingParams.recodePreferredCharset = " +
    correctiveRecordingParams.recodePreferredCharset + ", " +
    "correctiveRecordingParams.recodeUTF8 = " +
    correctiveRecordingParams.recodeUTF8 + ")");
    BiDiMailUI.JSConsoleService.logStringMessage('element textContent (all nodes together):\n\n' + element.textContent);
#endif
  if (!correctiveRecordingParams.recodePreferredCharset &&
      !correctiveRecordingParams.recodeUTF8) {
#ifdef DEBUG_performCorrectiveRecoding
    BiDiMailUI.JSConsoleService.logStringMessage('nothing to do, returning');
#endif
    return;
  }
  
  // This redundant setting of the charset is necessary to overcome an
  // issue with TB 2.x in which the first time you set the charset and
  // attempted to recode, you'd get a NS_ERROR_FAILURE exception;
  // see bug 
  BiDiMailUI.UnicodeConverter.charset = correctiveRecordingParams.preferredCharset;

  var treeWalker = document.createTreeWalker(
    correctiveRecordingParams.body,
    NodeFilter.SHOW_TEXT,
    null, // additional filter function
    false
  );
  var node;
  while((node = treeWalker.nextNode())) {
    if (node.data)
      node.data = BiDiMailUI.performCorrectiveRecodingOnText(
        node.data,correctiveRecordingParams);
  }
  if (correctiveRecordingParams.recodeUTF8) {
    correctiveRecordingParams.body.setAttribute('bidimailui-recoded-utf8',true);
  }
  if (correctiveRecordingParams.recodePreferredCharset) {
    correctiveRecordingParams.body.setAttribute('bidimailui-recoded-charset',
      correctiveRecordingParams.preferredCharset);
  }

  if (correctiveRecordingParams.subjectSetter) try {
    correctiveRecordingParams.subjectSetter(
      BiDiMailUI.performCorrectiveRecodingOnText(
        correctiveRecordingParams.messageSubject,correctiveRecordingParams));
  } catch(ex) { }
  return;
}


BiDiMailUI.codepageMisdetectionExpression =
  new RegExp (BiDiMailUI.RegExpStrings.CODEPAGE_MISDETECTION_SEQUENCE);
BiDiMailUI.utf8MisdetectionExpression =
  new RegExp (BiDiMailUI.RegExpStrings.MISDETECTED_UTF8_SEQUENCE);


BiDiMailUI.performCorrectiveRecodingOnText = function(
  str,correctiveRecordingParams) {
#ifdef DEBUG_performCorrectiveRecodingOnText
  BiDiMailUI.JSConsoleService.logStringMessage(
    "corrective-recording the string:\n" + str);
#endif
  if (!str) return;
  if (!correctiveRecordingParams.recodeUTF8 &&
    !correctiveRecordingParams.recodePreferredCharset) return;
  var lines = str.split('\n');
#ifdef DEBUG_performCorrectiveRecodingOnText
  BiDiMailUI.JSConsoleService.logStringMessage(
    "string has " + lines.length + " lines");
#endif
  for(var i = 0; i < lines.length; i++) {
    var workingStr; 

#ifdef DEBUG_performCorrectiveRecodingOnText
    if (correctiveRecordingParams.recodeUTF8 &&
      !BiDiMailUI.utf8MisdetectionExpression.test(lines[i])) {
#ifdef DEBUG_scancodes
      BiDiMailUI.JSConsoleService.logStringMessage(
        "line is not misdecoded UTF-8:\n" + lines[i] +
        "\n----\n" + BiDiMailUI.JS.stringToScanCodes(lines[i]));
#else
      BiDiMailUI.JSConsoleService.logStringMessage(
        "line is not misdecoded UTF-8:\n" + lines[i]);
#endif
    }
#endif
    // Note: It's _important_ to check for UTF-8 first, because that has the 
    // much more distinctive [D7-D9] blah [D7-D9] blah [D7-D9] blah pattern!
    if (correctiveRecordingParams.recodeUTF8 &&
      BiDiMailUI.utf8MisdetectionExpression.test(lines[i])) {
#ifdef DEBUG_performCorrectiveRecodingOnText
      BiDiMailUI.JSConsoleService.logStringMessage("trying to recode UTF-8");
#endif
      try {
        workingStr = lines[i];
        
        // at this point, correctiveRecordingParams.mailnewsDecodingType can only be latin or preferred
        BiDiMailUI.UnicodeConverter.charset =
          (correctiveRecordingParams.mailnewsDecodingType == "latin-charset") ?
           'windows-1252' : correctiveRecordingParams.preferredCharset;
#ifdef DEBUG_scancodes
        BiDiMailUI.JSConsoleService.logStringMessage(
          "decoded as " + BiDiMailUI.UnicodeConverter.charset + ":\n" +
          workingStr + "\n----\n" + BiDiMailUI.JS.stringToScanCodes(workingStr));
#endif

        
        workingStr = BiDiMailUI.UnicodeConverter.ConvertFromUnicode(workingStr);
        // TODO: not sure we need this next line
        workingStr += BiDiMailUI.UnicodeConverter.Finish();

#ifdef DEBUG_scancodes
        BiDiMailUI.JSConsoleService.logStringMessage("undecoded bytes:\n" +
          workingStr  + "\n----\n" + BiDiMailUI.JS.stringToScanCodes(workingStr));
#endif

        // We see a lot of D7 20's instead of D7 A0's which are the 2-byte sequence for 
        // the Hebrew letter Nun; I guess some clients or maybe even Mozilla replace A0
        // (a non-breaking space in windows-1252) with 20 (a normal space)
        workingStr = workingStr.replace(/([\xD7-\xD9])\x20/g, "$1\xA0");

        // remove some higher-than-0x7F characters originating in HTML entities, such as &nbsp;
        // (we remove them only if they're not the second byte of a two-byte sequence; we ignore
        // the possibility of their being part of a 3-to-6-byte sequence)
        workingStr = workingStr.replace(/(^|[\x00-\xBF])\xA0+/g, "$1 ");

        // decode any numeric HTML entities ; 
        // weird stuff we don't recognize will be replaced with the 
        // UTF-8 encoding of a \uFFFD (unicode replacement char)
        workingStr = workingStr.replace(
          /[\xC2-\xDF]*&#(\d+);/g,
          function() {
            var res = String.fromCharCode(RegExp.$1);
            return ((res.charCodeAt(0) > 0xBF) ? "\xEF\xBF\xBD" : res);
          }
          );

        // first byte of a two-byte sequence followed by a byte not completing the sequence
        workingStr = workingStr.replace(/[\xD7-\xD9]([^\x80-\xBF]|$)/g, "$1");

#ifdef DEBUG_scancodes
        BiDiMailUI.JSConsoleService.logStringMessage(
          "after preprocessing (decoding of HTML entities, removing NBSPs (A0's)," + 
          "removing unterminated 2-byte sequences):\n" + workingStr +
          "\n----\n" + BiDiMailUI.JS.stringToScanCodes(workingStr));
#endif

        BiDiMailUI.UnicodeConverter.charset = "UTF-8";
        workingStr = BiDiMailUI.UnicodeConverter.ConvertToUnicode(workingStr);
          
#ifdef DEBUG_scancodes
        BiDiMailUI.JSConsoleService.logStringMessage(
          "decoded UTF-8:\n" + workingStr + "\n----\n" +
          BiDiMailUI.JS.stringToScanCodes(lines[i]));
#endif
        lines[i] = workingStr;
      } catch(ex) {
#ifdef DEBUG_scancodes
        BiDiMailUI.JSConsoleService.logStringMessage(
          "Exception while trying to recode \n" + lines[i] + "\n\n" + ex);
#else
        dump("Exception while trying to recode \n" + lines[i] + "\n\n" + ex);
#endif
        // in some cases we seem to get manged UTF-8 text
        // which can be fixed by re-applying the current character set to the message,
        // then recoding if necessary; see 
        // https://www.mozdev.org/bugs/show_bug.cgi?id=18707
        if (/(\x3F[20\x90-\xA8]){3,}/.test(workingStr)) {
          correctiveRecodingParams.needCharsetForcing = true;
        }
      }
    }
    else if (correctiveRecordingParams.recodePreferredCharset &&
      BiDiMailUI.codepageMisdetectionExpression.test(lines[i])) {
#ifdef DEBUG_performCorrectiveRecodingOnText
        BiDiMailUI.JSConsoleService.logStringMessage(
          "trying to recode preferred charset");
#endif
      try {
        // at this point, correctiveRecordingParams.mailnewsDecodingType can only be latin or UTF-8
        BiDiMailUI.UnicodeConverter.charset =
          (correctiveRecordingParams.mailnewsDecodingType == "latin-charset") ? 'windows-1252' : "UTF-8";
#ifdef DEBUG_performCorrectiveRecodingOnText
        BiDiMailUI.JSConsoleService.logStringMessage(
          "set charset to" + (correctiveRecordingParams.mailnewsDecodingType == "latin-charset") ? 'windows-1252' : "UTF-8");
#endif
#ifdef DEBUG_scancodes
        BiDiMailUI.JSConsoleService.logStringMessage(
          "decoded as " + BiDiMailUI.UnicodeConverter.charset + ":\n" + lines[i] +
          "\n----\n" + BiDiMailUI.JS.stringToScanCodes(lines[i]));
#endif
      
        workingStr = lines[i];
        workingStr = BiDiMailUI.UnicodeConverter.ConvertFromUnicode(lines[i]);
        // TODO: not sure we need this next line
        workingStr += BiDiMailUI.UnicodeConverter.Finish();
#ifdef DEBUG_scancodes
        BiDiMailUI.JSConsoleService.logStringMessage(
          "undecoded bytes:\n" + workingStr  + "\n----\n" + 
          BiDiMailUI.JS.stringToScanCodes(workingStr));
#endif
        BiDiMailUI.UnicodeConverter.charset = correctiveRecordingParams.preferredCharset;
        lines[i] = BiDiMailUI.UnicodeConverter.ConvertToUnicode(workingStr);
#ifdef DEBUG_scancodes
        BiDiMailUI.JSConsoleService.logStringMessage(
          "decoded " + correctiveRecordingParams.preferredCharset + ":\n" +
          lines[i] + "\n----\n" + BiDiMailUI.JS.stringToScanCodes(lines[i]));
#endif
      } catch(ex) {
#ifdef DEBUG_performCorrectiveRecodingOnText
        BiDiMailUI.JSConsoleService.logStringMessage(
          "Exception while trying to recode \n" + workingStr + "\n\n" + ex);
#else
        dump("Exception while trying to recode \n" + workingStr + "\n\n" + ex);
#endif
      }
    }
  }
  return lines.join('\n');
}


BiDiMailUI.matchInText = function(element, expression, matchResults) {
#ifdef DEBUG_matchInText
  BiDiMailUI.JSConsoleService.logStringMessage(
    "---------------------------------------------\n" +
    "matching " + expression + "\nin element" + element);
#endif
  var treeWalker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null, // additional filter function
    false
  );
  while ((node = treeWalker.nextNode())) {
#ifdef DEBUG_matchInText
#ifdef DEBUG_scancodes
    BiDiMailUI.JSConsoleService.logStringMessage(node.data +
      "\n" + BiDiMailUI.JS.stringToScanCodes(node.data));
#else
    BiDiMailUI.JSConsoleService.logStringMessage(node.data);
#endif
#endif
    if (expression.test(node.data)) {
      if (matchResults) {
        matchResults.hasMatching = true;
      }
      else {
#ifdef DEBUG_matchInText
        BiDiMailUI.JSConsoleService.logStringMessage(
          "found match.\n---------------------------------------------");
#endif
        return true;
      }
    }
    else if (matchResults) {
      matchResults.hasNonMatching = true;
    }
    
#ifdef DEBUG_matchInText
    if (!matchResults) {
      BiDiMailUI.JSConsoleService.logStringMessage(
        "... node doesn't match.\n");
    }
#endif
  }
#ifdef DEBUG_matchInText
  BiDiMailUI.JSConsoleService.logStringMessage( 
    ((matchResults ? matchResults.hasMatching : false) ? "found" : "no") +
    " match.\n---------------------------------------------");
#endif
  return (matchResults ? matchResults.hasMatching : false);
}

BiDiMailUI.neutralsOnly = function(str) {
#ifdef DEBUG_neutralsOnly
  BiDiMailUI.JSConsoleService.logStringMessage("in neutralsOnly for\n\n" + str);
#endif
  var neutrals =
    new RegExp("^[ \\f\\r\\n\\t\\v\\u00A0\\u2028\\u2029!-@\[-`\{-\xA0\u2013\\u2014\\uFFFD]*$");
  return neutrals.test(str);
}

  
// returns "rtl", "ltr", "neutral" or "mixed"; but only an element
// with more than one text node can be mixed
BiDiMailUI.directionCheck = function(obj) {

  const RTL_CHARACTER_INNER =
   "\\u0590-\\u05FF\\uFB1D-\\uFB4F\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFC";
  const RTL_CHARACTER = "[" + RTL_CHARACTER_INNER + "]";
  const RTL_SEQUENCE = "(" +  RTL_CHARACTER + "{2,}|" + RTL_CHARACTER + "\"" +
           RTL_CHARACTER + ")";
  const LTR_SEQUENCE = "(" +  "\\w" + "[\\-@\\.']?" + ")" + "{2,}";
  const NEUTRAL_CHARACTER_INNER =
    " \\f\\r\\t\\v\\u00A0\\u2028\\u2029!-@\[-`\{-\xA0\u2013\\u2014\\uFFFD";
  const NEUTRAL_CHARACTER = "[" + NEUTRAL_CHARACTER_INNER + "]";
  const NEUTRAL_CHARACTER_NEW_LINE = "[\\n" + NEUTRAL_CHARACTER_INNER + "]";
  const IGNORABLE_CHARACTER = "[" + NEUTRAL_CHARACTER_INNER +
    RTL_CHARACTER_INNER + "]";
  const IGNORABLE_CHARACTER_NEW_LINE = "[" + NEUTRAL_CHARACTER_INNER +
    RTL_CHARACTER_INNER + "\\n]";


#ifdef DEBUG_directionCheck
  BiDiMailUI.JSConsoleService.logStringMessage("in directionCheck(" + obj + ")");
#endif
  // we check whether there exists a line which either begins
  // with a word consisting solely of characters of an RTL script,
  // or ends with two such words (excluding any punctuation/spacing/
  // numbering at the beginnings and ends of lines)

  // note we're allowing sequences of initials, e.g W"ERBEH
  var allNeutralExpression = new RegExp (
    "^" + NEUTRAL_CHARACTER_NEW_LINE + "*" + "$");
  var rtlLineExpression = new RegExp (
    // either the text has no non-RTL characters and some RTL characters
    "(" + "^" + IGNORABLE_CHARACTER_NEW_LINE + "*" + RTL_CHARACTER + IGNORABLE_CHARACTER_NEW_LINE + "*" + "$" + ")" +
    "|" +
    // or it has only one non-RTL 'word', with an RTL 'word' before it
    "(" + "^" + IGNORABLE_CHARACTER + "*" + RTL_SEQUENCE + IGNORABLE_CHARACTER + "+" + LTR_SEQUENCE + IGNORABLE_CHARACTER + "*" +  "$" + ")" +
    "|" +
    // or it has only one non-RTL 'word', with an RTL 'word' after it
    "(" + "^" + IGNORABLE_CHARACTER + "*" + LTR_SEQUENCE + IGNORABLE_CHARACTER + "+" + RTL_SEQUENCE + IGNORABLE_CHARACTER + "*" +  "$" + ")" +
    "|" +
    // or it has a line with two RTL 'words' before any non-RTL characters
    "(" + "(^|\\n)" + IGNORABLE_CHARACTER + "*" + RTL_SEQUENCE + NEUTRAL_CHARACTER + "+" + RTL_SEQUENCE + ")" +
    "|" +
    // or it has a line with two RTL 'words' after all non-RTL characters
    "(" + RTL_SEQUENCE + NEUTRAL_CHARACTER + "+" + RTL_SEQUENCE + IGNORABLE_CHARACTER + "*" + "($|\\n)" + ")" );

  if (typeof obj == 'string') {
    if (allNeutralExpression.test(obj)) {
#ifdef DEBUG_directionCheck
      BiDiMailUI.JSConsoleService.logStringMessage("directionCheck - string\n\n"+obj+"\n\nis NEUTRAL");
#endif
      return "neutral";
    }
#ifdef DEBUG_directionCheck
    BiDiMailUI.JSConsoleService.logStringMessage("directionCheck - string\n\n"+obj+"\n\nis " + (rtlLineExpression.test(obj) ? "RTL" : "LTR") );
#endif
    return (rtlLineExpression.test(obj) ? "rtl" : "ltr");
  }
  else { // it's a DOM node
#ifdef DEBUG_scancodes
    BiDiMailUI.JSConsoleService.logStringMessage("obj.textContent:\n" + obj.textContent + "\n" + BiDiMailUI.JS.stringToScanCodes(obj.textContent));
#endif
    if (allNeutralExpression.test(obj.textContent)) {
#ifdef DEBUG_directionCheck
      BiDiMailUI.JSConsoleService.logStringMessage("directionCheck - object "+obj+"\nis NEUTRAL");
#endif
      return "neutral";
    }
#ifdef DEBUG_directionCheck
      BiDiMailUI.JSConsoleService.logStringMessage("object is NOT NEUTRAL");
#endif
    var matchResults = {};
    BiDiMailUI.matchInText(obj, rtlLineExpression, matchResults);
#ifdef DEBUG_directionCheck
    BiDiMailUI.JSConsoleService.logStringMessage("directionCheck - object "+obj+"\nis " + (matchResults.hasMatching ?
            (matchResults.hasNonMatching ? "MIXED" : "RTL") : "LTR") );
#endif
    return (matchResults.hasMatching ?
            (matchResults.hasNonMatching ? "mixed" : "rtl") : "ltr");
  }
  //  return rtlLineExpression.test(element.textContent);
}

