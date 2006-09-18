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

var hD="0123456789ABCDEF";
// decimal to hexadecimal representation
function d2h(d) {
  var h = hD.substr(d&15,1);
  while(d>15) {d>>=4;h=hD.substr(d&15,1)+h;}
  return h;
}

function misdetectedRTLCodePage(element,rtlSequence)
{
  var initialMatch;
  if (msgWindow.mailCharacterSet == "US-ASCII" ||
      msgWindow.mailCharacterSet == "ISO-8859-1" ||
      msgWindow.mailCharacterSet == "windows-1252") {
     // if instead of the actual windows-1255/6 charset, mozilla used
     // latin-1 or similar, instead of Hebrew/Arabic characters we would
     // see latin characters with accent, from the upper values of the 
     // 256-value charset; see explanation of the regexp specifics in 
     // canBeAssumedRTL()

    var misdetectedRTLSequence = "[\\u00BF-\\u00FF]{3,}";

    var normalIgnore = "(\\s|[<>\\.;,:0-9\"'])*";
    var nonEmptyNormalIgnore = "(\\s|[<>\\.;,:0-9\"'])+";
    var normalExpression = new RegExp (
      "(" + "^" + normalIgnore + misdetectedRTLSequence + normalIgnore + "$" + ")" +
      "|" +
      "(" + "(^|\\n)" + misdetectedRTLSequence + misdetectedRTLSequence + nonEmptyNormalIgnore + "(" + nonEmptyNormalIgnore + "|$|\\n)" + ")" +
      "|" +
      "(" + misdetectedRTLSequence + nonEmptyNormalIgnore + misdetectedRTLSequence + normalIgnore + "($|\\n)" + ")" );
 
    var htmlizedIgnore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)*";
    var nonEmptyHtmlizedIgnore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)+";
    var htmlizedExpression = new RegExp (
      "(" + "(^|>|\\n)" + htmlizedIgnore + misdetectedRTLSequence + nonEmptyHtmlizedIgnore + "(" + nonEmptyHtmlizedIgnore + "|$|\\n|<)" + ")" +
      "|" +
      "(" + misdetectedRTLSequence + nonEmptyHtmlizedIgnore + misdetectedRTLSequence + htmlizedIgnore + "($|\\n|<)" + ")" );
    initialMatch = matchInText(element, normalExpression, htmlizedExpression);
    if (initialMatch) {
#ifdef DEBUG_misdetectedRTLCodePage
      jsConsoleService.logStringMessage("matched\n" + normalExpression + "\nor\n" + htmlizedExpression + "\nin the text");
#endif
    }
    else {
#ifdef DEBUG_misdetectedRTLCodePage
      jsConsoleService.logStringMessage("did NOT match\n" + normalExpression + "\nor\n" + htmlizedExpression + "\nin the text");
#endif
    }
  }
  else { // it's "UTF-8" or ""
   // if instead of the actual windows-1255/6 charset, mozilla used
   // UTF-8, it 'gives up' on seeing [\u00BF-\u00FF][\u00BF-\u00FF] byte pairs,
   // so it decodes them as \FFFD 's for some reason
    var misDetectionExpression = new RegExp("\\uFFFD{3,}");
    initialMatch = matchInText(element, misDetectionExpression, misDetectionExpression);
    if (initialMatch) {
#ifdef DEBUG_misdetectedRTLCodePage
      jsConsoleService.logStringMessage("matched " + misDetectionExpression + " in the text");
#endif
    }
    else {
#ifdef DEBUG_misdetectedRTLCodePage
      jsConsoleService.logStringMessage("did NOT match " + misDetectionExpression + " in the text");
#endif
    }
  }

  if (initialMatch) {
    var falsePositiveRegExp = new RegExp(rtlSequence);
    if (!canBeAssumedRTL(element,rtlSequence)) {
#ifdef DEBUG_misdetectedRTLCodePage
      jsConsoleService.logStringMessage("text can NOT be assumed RTL with " + rtlSequence + " , confirming misdetected codepage");
#endif
      return true;
    }
    else {
#ifdef DEBUG_misdetectedRTLCodePage
      jsConsoleService.logStringMessage("text CAN be assumed RTL with " + rtlSequence + " , rejecting misdetected codepage");
#endif
    }
  }
  return false;
}

// TODO: currently, this function only works properly with Hebrew text

function misdetectedUTF8(element)
{
  // hebrew letters in UTF8 are 0xD7 followed by a byte in the range 0x90 - 0xAA
  // I don't know what the other chars are about...
  // maybe check for some english text? spacing? something else?
  // Also, it seems UTF-8 messages which mozilla displays using
  // ISO-8859-8-I have FFFD's for some reason
  var misdetectedUTF8Sequence = "(\\u00D7(\\u201D|\\u2022|\\u2220|\\u2122|[\\u0090-\\u00AA])){3,}|\\uFFFD{3,}";
  var re = new RegExp (misdetectedUTF8Sequence);
  return matchInText(element, re, re);
}

function canBeAssumedRTL(element,rtlSequence)
{
  // we check whether there exists a line which either begins
  // with a word consisting solely of characters of an RTL script,
  // or ends with two such words (excluding any punctuation/spacing/
  // numbering at the beginnings and ends of lines)

  var normalIgnore = "(\\s|[<>\\.;,:0-9\"'])*";
  var nonEmptyNormalIgnore = "(\\s|[<>\\.;,:0-9\"'])+";
  var normalExpression = new RegExp (
    // either message has only one line whose single word is RTL
    "(" + "^" + normalIgnore + rtlSequence + normalIgnore + "$" + ")" +
    "|" +
    // or it has a line which begins with two RTL words
    "(" + "(^|\\n)" + normalIgnore + rtlSequence + nonEmptyNormalIgnore + "(" + nonEmptyNormalIgnore + "|$|\\n)" + ")" +
    "|" +
    // or it has a line which ends with two RTL words
    "(" + rtlSequence + nonEmptyNormalIgnore + rtlSequence + normalIgnore + "($|\\n)" + ")" );

  var htmlizedIgnore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)*";
  var nonEmptyHtmlizedIgnore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)+";
  var htmlizedExpression = new RegExp (
    // either message has a sequence between HTML >'s and <'s which begins with two RTL words
    "(" + "(^|>|\\n)" + htmlizedIgnore + rtlSequence + nonEmptyHtmlizedIgnore + "(" + nonEmptyHtmlizedIgnore + "|$|\\n|<)" + ")" +
    "|" +
    // or it has such a sequence which ends with two RTL words
    "(" + rtlSequence + nonEmptyHtmlizedIgnore + rtlSequence + htmlizedIgnore + "($|\\n|<)" + ")" );
  return matchInText(element, normalExpression, htmlizedExpression);
}

function matchInText(element, normalExpression, htmlizedExpression)
{
#ifdef DEBUG_matchInText
  jsConsoleService.logStringMessage("---------------------------------------------\n" + "matching " + normalExpression);
#endif
  try {
    var iterator = new XPathEvaluator();
    var path = iterator.evaluate("descendant-or-self::text()", element, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    for (var node = path.iterateNext(); node; node = path.iterateNext())
    {
#ifdef DEBUG_matchInText
      var str = "";
      for(i = 0; i < node.data.length; i++) {
        str += d2h(node.data.charCodeAt(i)) + " ";  
      }
      jsConsoleService.logStringMessage(node.data + "\n" + str);
#endif
      if (normalExpression.test(node.data)) {
#ifdef DEBUG_matchInText
        jsConsoleService.logStringMessage("found match.\n---------------------------------------------");
#endif
        return true;
      }
    }
  } catch(ex) {
    // 'new XPathEvaluator()' doesn't work for some reason, so we have
    // to test the HTMLized message rather than the bare text lines;
    // the regexp must change accordingly

#ifdef DEBUG_matchInText
    jsConsoleService.logStringMessage(theHTML + "\n" + str);
#endif
    
    if (htmlizedExpression.test(element.innerHTML)) {
#ifdef DEBUG_matchInText
      jsConsoleService.logStringMessage("matches.\n---------------------------------------------");
#endif
      return true;
    }
  }
#ifdef DEBUG_matchInText
  jsConsoleService.logStringMessage("no match.\n---------------------------------------------");
#endif
  return false;
}

// Prefs helper
var gBDMPrefs = {
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