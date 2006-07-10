var hD="0123456789ABCDEF";
// decimal to hexadecimal representation
function d2h(d) {
  var h = hD.substr(d&15,1);
  while(d>15) {d>>=4;h=hD.substr(d&15,1)+h;}
  return h;
}

function misdetectedRTLCodePage(element,rtlSequence)
{
  var misdetectionRegExp;
  if (msgWindow.mailCharacterSet == "US-ASCII" ||
      msgWindow.mailCharacterSet == "ISO-8859-1" ||
      msgWindow.mailCharacterSet == "windows-1252") {
     // if instead of the actual windows-1255/6 charset, mozilla used
     // latin-1 or similar, instead of Hebrew/Arabic characters we would
     // see latin characters with accent, from the upper values of the 
     // 256-value charset
     misdetectionRegExp = new RegExp("([\\u00BF-\\u00FF]{2,})");
  }
  else { // it's "UTF-8" or ""
   // if instead of the actual windows-1255/6 charset, mozilla used
   // UTF-8, it 'gives up' on seeing [\u00BF-\u00FF][\u00BF-\u00FF] byte pairs,
   // so it decodes them as \FFFD 's for some reason
    misdetectionRegExp = new RegExp("\\uFFFD{3,}");
  }
  if (matchInText(element, misdetectionRegExp, misdetectionRegExp)) {
    //jsConsoleService.logStringMessage("matched " + misdetectionRegExp + " in the text");
    var falsePositiveRegExp = new RegExp(rtlSequence);
    if (!matchInText(element, falsePositiveRegExp, falsePositiveRegExp)) {
      //jsConsoleService.logStringMessage("did NOT match " + falsePositiveRegExp + " in the text");
      return true;
    }
    else {
      //jsConsoleService.logStringMessage("matched " + falsePositiveRegExp + " in the text");
    }
  }
  else {
    //jsConsoleService.logStringMessage("did NOT match " + misdetectionRegExp + " in the text");
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

  var normalIgnore = "(\\s|[<>\\.;,:0-9\"'])";
  var normalExpression = new RegExp ("(^" + normalIgnore + "*" + rtlSequence + ")|(" +
                         rtlSequence + normalIgnore + "+" + rtlSequence + normalIgnore + "*$)");

  var htmlizedIgnore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)";
  var htmlizedExpression = new RegExp ("((^|>)" + htmlizedIgnore + "*" + rtlSequence + ")|(" +
                       rtlSequence + htmlizedIgnore + "+" + rtlSequence + htmlizedIgnore + "*($|<))");
  return matchInText(element, normalExpression, htmlizedExpression);
}

function matchInText(element, normalExpression, htmlizedExpression)
{
  //jsConsoleService.logStringMessage("---------------------------------------------\n" + "matching " + normalExpression);
  try {
    var iterator = new XPathEvaluator();
    var path = iterator.evaluate("descendant-or-self::text()", element, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    for (var node = path.iterateNext(); node; node = path.iterateNext())
    {
      //var str = "";
      //for(i = 0; i < node.data.length; i++) {
      //  str += d2h(node.data.charCodeAt(i)) + " ";  
      //}
      //jsConsoleService.logStringMessage(node.data + "\n" + str);
      if (normalExpression.test(node.data)) {
        //jsConsoleService.logStringMessage("found match.\n---------------------------------------------");
        return true;
      }
    }
  } catch(ex) {
    // 'new XPathEvaluator()' doesn't work for some reason, so we have
    // to test the HTMLized message rather than the bare text lines;
    // the regexp must change accordingly

    //var theHTML = element.innerHTML;
    //for(i = 0; i < theHTML.length; i++) {
    //  str += d2h(theHTML.charCodeAt(i)) + " ";  
    //}
    //jsConsoleService.logStringMessage(theHTML + "\n" + str);
    
    if (htmlizedExpression.test(element.innerHTML)) {
      //jsConsoleService.logStringMessage("matches.\n---------------------------------------------");
      return true;
    }
  }
  //jsConsoleService.logStringMessage("no match.\n---------------------------------------------");
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