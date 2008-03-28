/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the HebMailPack extension.
 *
 * The Initial Developer of the Original Code is Moofie.
 *
 * Portions created by the Initial Developer are Copyright (C) 2004-2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Eyal Rozenberg <eyalroz@technion.ac.il>
 *   Asaf Romano <mozilla.mano@sent.com>
 *   Ilya Konstantinov <mozilla-code@future.shiny.co.il>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

__defineGetter__("gBidimailuiStrings", function() {
  delete this.gBidimailuiStrings;
  return this.gBidimailuiStrings =
    Components.classes["@mozilla.org/intl/stringbundle;1"]
              .getService(Components.interfaces.nsIStringBundleService)
              .createBundle("chrome://bidimailpack/locale/bidimailpack.properties");
});

__defineGetter__("gUnicodeConverter", function() {
  delete this.gUnicodeConverter;
  return this.gUnicodeConverter =
    Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
              .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
});

#ifdef DEBUG
__defineGetter__("gJSConsoleService", function() {
  delete this.gJSConsoleService;
  return this.gJSConsoleService =
    Components.classes['@mozilla.org/consoleservice;1']
              .getService(Components.interfaces.nsIConsoleService);
});
#endif

// number to hexadecimal representation

const HEX_DIGITS = "0123456789ABCDEF";

function num2hex(num) {
  var hexString = HEX_DIGITS.substr(num & 15, 1);
  while(num > 15) {
    num >>= 4;
    hexString = HEX_DIGITS.substr(num & 15, 1) + hexString;
  }
  return hexString;
}

#ifdef DEBUG
function stringToScanCodes(str) 
{
  if (str == null)
    return null;
  var scanCodesString = "";
  for(var i = 0; i < str.length; i++) {
    scanCodesString += num2hex(str.charCodeAt(i)) + " ";  
  }
  return scanCodesString;
}
#endif

// Prefs helper
var gBDMPrefs = {
  get prefService()
  {
    delete this._prefService;
    return this._prefService =
      Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefBranch);
  },

  getBoolPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getBoolPref("bidiui.mail." + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  getCharPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getCharPref("bidiui.mail." + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  setBoolPref: function(prefName, val) {
    this.prefService.setBoolPref("bidiui.mail." + prefName, val);
  },

  setCharPref: function(prefName, val) {
    this.prefService.setCharPref("bidiui.mail." + prefName, val);
  },

  // Prefs Migrator:
  _shouldMigrate: function(extVersion) {
    return !this.getBoolPref("migrated" + extVersion, false);
  },

  _setMigrated: function(extVersion) {
    this.setBoolPref("migrated" + extVersion, true);
  },

  migrateOldPrefs: function() {
    // Migrate 0.6.7 prefs
    if (!this._shouldMigrate("067"))
      return;

    // NOTE: Hidden prefs aren't migrated.
    try {
      if (!this.prefService.getBoolPref("mail.compose.show_direction_buttons"))
        this.setBoolPref("compose.show_direction_buttons", false);

      this.prefService.clearUserPref("mail.compose.show_direction_buttons");
    } catch(ex) { }

    try {
      if (this.prefService
              .getCharPref("mailnews.send_default_direction")
              .toLowerCase() != "ltr")
        this.setCharPref("compose.default_direction", "rtl");

      this.prefService.clearUserPref("mailnews.send_default_direction");
    } catch(ex) { }

    try {
      if (this.prefService.getBoolPref("mailnews.reply_in_default_direction"))
        this.setBoolPref("compose.reply_in_default_direction", true);

      this.prefService.clearUserPref("mailnews.reply_in_default_direction");
    } catch(ex) { }

    try {
      var oldValue =
        this.prefService
#ifdef MOZ_THUNDERBIRD
            .getCharPref("mailnews.paragraph.vertical_margin.value");
#else
            .getCharPref("editor.paragraph.vertical_margins.value");
#endif
      if (oldValue != "0") {
        var scale =
          this.prefService
#ifdef MOZ_THUNDERBIRD
              .getCharPref("mailnews.paragraph.vertical_margin.scale");
#else
              .getCharPref("editor.paragraph.vertical_margins.scale");
#endif
        var newValue;
        if (scale != "px")
          newValue = parseFloat(oldValue, 10) * 2;
        else
          newValue = parseInt(oldValue, 10) * 2;

        if (!isNaN(newValue)) {
          this.setCharPref("compose.space_between_paragraphs.value", newValue);
          this.setCharPref("compose.space_between_paragraphs.scale", scale);
        }
      }

#ifdef MOZ_THUNDERBIRD
      this.prefService
          .clearUserPref("mailnews.paragraph.vertical_margin.value");
      this.prefService
          .clearUserPref("mailnews.paragraph.vertical_margin.scale");
#else
      this.prefService
          .clearUserPref("editor.paragraph.vertical_margins.value");
      this.prefService
          .clearUserPref("editor.paragraph.vertical_margins.scale");
#endif
    } catch(ex) { }

    this._setMigrated("067");
  }
}

function GetMessageContentElement(domDoc) {
  if (!domDoc)
    throw("Called GetMessageContentElement with no document");

  var bodyElement = domDoc.body;
  if (!bodyElement)
    throw("Cannot get the message content element without a body element");

  // Try to find the DIV element which contains the message content
  var firstSubBody = null;
  var elementsRequiringExplicitDirection = bodyElement.getElementsByTagName("div");
  for (var i = 0; i < elementsRequiringExplicitDirection.length && !firstSubBody; i++) {
    if (/^moz-text/.test(elementsRequiringExplicitDirection[i].className))
      firstSubBody = elementsRequiringExplicitDirection[i];
  }

  // If there's no such element or if the element has no text under it (happens
  // when "Simple HTML" mode is used see Mozilla bug 282476), the meesage 
  // content element is inside the body element itself
  if (!firstSubBody || gatherTextUnder(firstSubBody) == "")
    return bodyElement;

  return firstSubBody;
}

const MISDETECTED_RTL_CHARACTER = "[\\xBF-\\xD6\\xD8-\\xFF]"
const MISDETECTED_RTL_SEQUENCE = MISDETECTED_RTL_CHARACTER + "{2,}";

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
const CODEPAGE_MISDETECTION_SEQUENCE =
  MISDETECTED_RTL_CHARACTER + "{3,}" + "|" +  "(" + "(\\s|\"|\W|^)" +
  MISDETECTED_RTL_CHARACTER + "{2,}(\"|\\s|\W|$)" + ")";

// TODO: maybe it's better to undecode first, then check whether it's UTF-8;
// that will probably allow using a char range instead of so many individual
// chars
const MISDETECTED_UTF8_SEQUENCE = 
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
    
// Note: if both doCharset and doUTF8 is false, we only correct HTML entities
function performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,doCharset,doUTF8)
{
  var needCharsetReapplication = false;

#ifdef DEBUG_performCorrectiveRecoding
          gJSConsoleService.logStringMessage('---------------------------------\nin performCorrectiveRecoding(' + 
          preferredCharset + ', ' + mailnewsDecodingType + ", " + (doCharset ? "doCharset" : "!doCharset") + ", " + 
          (doUTF8 ? "doUTF8" : "!doUTF8") + ")");
          gJSConsoleService.logStringMessage('element textContent (all nodes together):\n\n' + element.textContent);
#endif
  if (!doCharset && !doUTF8) {
#ifdef DEBUG_performCorrectiveRecoding
    gJSConsoleService.logStringMessage('nothing to do, returning');
#endif
    return;
  }



  var codepageMisdetectionExpression = new RegExp (CODEPAGE_MISDETECTION_SEQUENCE);
  var utf8MisdetectionExpression = new RegExp (MISDETECTED_UTF8_SEQUENCE);

  var treeWalker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null, // additional filter function
    false
  );

  while((node = treeWalker.nextNode())) {  
    var lines = node.data.split('\n');
#ifdef DEBUG_performCorrectiveRecoding
    gJSConsoleService.logStringMessage("processing text node with " + lines.length + " lines");
#endif
    for(var i = 0; i < lines.length; i++) {
      var workingStr; 

#ifdef DEBUG_performCorrectiveRecoding
      if (doUTF8 && !utf8MisdetectionExpression.test(lines[i])) {
#ifdef DEBUG_scancodes
        gJSConsoleService.logStringMessage("line is not misdecoded UTF-8:\n" + lines[i] + "\n----\n" + stringToScanCodes(lines[i]));
#else
        gJSConsoleService.logStringMessage("line is not misdecoded UTF-8:\n" + lines[i]);
#endif
      }
#endif
      // Note: It's _important_ to check for UTF-8 first, because that has the 
      // much more distinctive [D7-D9] blah [D7-D9] blah [D7-D9] blah pattern!
      if (doUTF8 && utf8MisdetectionExpression.test(lines[i])) {
        try {
          workingStr = lines[i];
          
          // at this point, mailnewsDecodingType can only be latin or preferred
          gUnicodeConverter.charset =
            (mailnewsDecodingType == "latin-charset") ? 'windows-1252' : preferredCharset;
#ifdef DEBUG_scancodes
          gJSConsoleService.logStringMessage(
            "decoded as " + gUnicodeConverter.charset + ":\n" + workingStr + "\n----\n" + stringToScanCodes(workingStr));
#endif

        
          workingStr = gUnicodeConverter.ConvertFromUnicode(workingStr);
          // TODO: not sure we need this next line
          workingStr += gUnicodeConverter.Finish();

#ifdef DEBUG_scancodes
          gJSConsoleService.logStringMessage("undecoded bytes:\n" + workingStr  + "\n----\n" + stringToScanCodes(workingStr));
#endif

          // We see a lot of D7 20's instead of D7 A0's which are the 2-byte sequence for 
          // the Hebrew letter Nun; I guess some clients or maybe even Mozilla replace A0
          // (a non-breaking space in windows-1252) with 20 (a normal space)
          workingStr = workingStr.replace(/([\xD7-\xD9])\x20/g, "$1\xA0");

          // remove some higher-than-0x7F characters originating in HTML entities, such as &nbsp;
          // (we remove them only if they're not the second byte of a two-byte sequence; we ignore
          // the possibility of their being part of a 3-to-6-byte sequence)
          workingStr = workingStr.replace(/(^|[\x00-\xBF])\xA0+/g, "$1 ");

          // decode any numeric HTML entities ; weird stuff
          // will be replaced with the UTF-8 encoding of a \uFFFD (unicode replacement char)
          workingStr = workingStr.replace(
            /[\xC2–\xDF]*&#(\d+);/g,
            function() {
              var res = String.fromCharCode(RegExp.$1);
	      return ((res.charCodeAt(0) > 0xBF) ? "\xEF\xBF\xBD" : res);
            }
            );

          // first byte of a two-byte sequence followed by a byte not completing the sequence
          workingStr = workingStr.replace(/[\xD7-\xD9]([^\x80-\xBF]|$)/g, "$1");

#ifdef DEBUG_scancodes
          gJSConsoleService.logStringMessage(
            "after preprocessing (decoding of HTML entities, removing NBSPs (A0's)," + 
            "removing unterminated 2-byte sequences):\n" + workingStr +
            "\n----\n" + stringToScanCodes(workingStr));
#endif

          gUnicodeConverter.charset = "UTF-8";
          workingStr = gUnicodeConverter.ConvertToUnicode(workingStr);
          
#ifdef DEBUG_scancodes
          gJSConsoleService.logStringMessage("decoded UTF-8:\n" + workingStr + "\n----\n" + stringToScanCodes(lines[i]));
#endif
          lines[i] = workingStr;
        } catch(ex) {
#ifdef DEBUG_scancodes
          gJSConsoleService.logStringMessage("Exception while trying to recode \n" + lines[i] + "\n\n" + ex);
#else
          dump("Exception while trying to recode \n" + lines[i] + "\n\n" + ex);
#endif
          // in some cases we seem to get manged UTF-8 text
          // which can be fixed by re-applying the current character set to the message,
          // then recoding if necessary
          if (/(\x3F[20\x90-\xA8]){3,}/.test(workingStr)) {
            needCharsetReapplication = true;
          }
        }
      }
      else if (doCharset && codepageMisdetectionExpression.test(lines[i])) {
        //try{
          // at this point, mailnewsDecodingType can only be latin or UTF-8
          gUnicodeConverter.charset =
            (mailnewsDecodingType == "latin-charset") ? 'windows-1252' : "UTF-8";
#ifdef DEBUG_scancodes
          gJSConsoleService.logStringMessage(
            "decoded as " + gUnicodeConverter.charset + ":\n" + lines[i] + "\n----\n" + stringToScanCodes(lines[i]));
#endif
        
          workingStr = lines[i];
          workingStr = gUnicodeConverter.ConvertFromUnicode(lines[i]);
          // TODO: not sure we need this next line
          workingStr += gUnicodeConverter.Finish();
#ifdef DEBUG_scancodes
          gJSConsoleService.logStringMessage("undecoded bytes:\n" + workingStr  + "\n----\n" + stringToScanCodes(workingStr));
#endif
          gUnicodeConverter.charset = preferredCharset;
          lines[i] = gUnicodeConverter.ConvertToUnicode(workingStr);
#ifdef DEBUG_scancodes
          gJSConsoleService.logStringMessage("decoded " + preferredCharset + ":\n" + lines[i] + "\n----\n" + stringToScanCodes(lines[i]));
#endif
        //} catch(ex) {
#ifdef DEBUG_scancodes
        //  gJSConsoleService.logStringMessage("Exception while trying to recode \n" + line + "\n\n" + ex);
#else
        //  dump("Exception while trying to recode \n" + line + "\n\n" + ex);
#endif
        //}
      }
    }
#ifdef DEBUG_scancodes
//    gJSConsoleService.logStringMessage("lines:\n");
//    for(i = 0; i < lines.length; i++) {
//      gJSConsoleService.logStringMessage(lines[i]);
//    }
#endif
    if (doUTF8 || doCharset) {
      node.data = lines.join('\n');
    }
#ifdef DEBUG_scancodes
//    gJSConsoleService.logStringMessage("node.data is now\n" + node.data);
#endif
  }
  if (doUTF8) {
    element.setAttribute('bidimailui-recoded-utf8',true);
  }
  if (doCharset) {
    element.setAttribute('bidimailui-recoded-charset',preferredCharset);
  }
  return needCharsetReapplication;
}

function matchInText(element, expression, matchResults)
{
#ifdef DEBUG_matchInText
  gJSConsoleService.logStringMessage("---------------------------------------------\n" +
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
    gJSConsoleService.logStringMessage(node.data + "\n" + stringToScanCodes(node.data));
#else
    gJSConsoleService.logStringMessage(node.data);
#endif
#endif
    if (expression.test(node.data)) {
      if (matchResults) {
        matchResults.hasMatching = true;
      }
      else {
#ifdef DEBUG_matchInText
        gJSConsoleService.logStringMessage("found match.\n---------------------------------------------");
#endif
        return true;
      }
    }
    else if (matchResults) {
      matchResults.hasNonMatching = true;
    }
    
#ifdef DEBUG_matchInText
    if (!matchResults) {
      gJSConsoleService.logStringMessage("... node doesn't match.\n");
    }
#endif
  }
#ifdef DEBUG_matchInText
  gJSConsoleService.logStringMessage( 
    ((matchResults ? matchResults.hasMatching : false) ? "found" : "no") +
    " match.\n---------------------------------------------");
#endif
  return (matchResults ? matchResults.hasMatching : false);
}

function neutralsOnly(str)
{
#ifdef DEBUG_neutralsOnly
  gJSConsoleService.logStringMessage("in neutralsOnly for\n\n" + str);
#endif
  var neutrals = new RegExp("^[ \\f\\r\\n\\t\\v\\u00A0\\u2028\\u2029!-@\[-`\{-\xA0\u2013\\u2014\\uFFFD]*$");
  return neutrals.test(str);
}

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
  
// returns "rtl", "ltr", "neutral" or "mixed"; but only an element
// with more than one text node can be mixed
function directionCheck(obj)
{
#ifdef DEBUG_directionCheck
  gJSConsoleService.logStringMessage("in directionCheck(" + obj + ")");
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
      gJSConsoleService.logStringMessage("directionCheck - string\n\n"+obj+"\n\nis NEUTRAL");
#endif
      return "neutral";
    }
#ifdef DEBUG_directionCheck
    gJSConsoleService.logStringMessage("directionCheck - string\n\n"+obj+"\n\nis " + (rtlLineExpression.test(obj) ? "RTL" : "LTR") );
#endif
    return (rtlLineExpression.test(obj) ? "rtl" : "ltr");
  }
  else { // it's a DOM node
#ifdef DEBUG_scancodes
    gJSConsoleService.logStringMessage("obj.textContent:\n" + obj.textContent + "\n" + stringToScanCodes(obj.textContent));
#endif
    if (allNeutralExpression.test(obj.textContent)) {
#ifdef DEBUG_directionCheck
      gJSConsoleService.logStringMessage("directionCheck - object "+obj+"\nis NEUTRAL");
#endif
      return "neutral";
    }
#ifdef DEBUG_directionCheck
      gJSConsoleService.logStringMessage("object is NOT NEUTRAL");
#endif
    var matchResults = {};
    matchInText(obj, rtlLineExpression, matchResults);
#ifdef DEBUG_directionCheck
    gJSConsoleService.logStringMessage("directionCheck - object "+obj+"\nis " + (matchResults.hasMatching ?
            (matchResults.hasNonMatching ? "MIXED" : "RTL") : "LTR") );
#endif
    return (matchResults.hasMatching ?
            (matchResults.hasNonMatching ? "mixed" : "rtl") : "ltr");
  }
  //  return rtlLineExpression.test(element.textContent);
}

