function misdetectedRTLCodePage(element)
{
  var misdetectedCodePageSequence = "([\\u00BF-\\u00FF]{2,}|\\uFFFD{2,})";
  var normalIgnore = "(\\s|[<>\\.;,:0-9\"'])";
  var normalExpression = new RegExp ("(^|" + normalIgnore + "+)" + misdetectedCodePageSequence + "("+ normalIgnore + "+|$)");

  var htmlizedIgnore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)";
  var htmlizedExpression = new RegExp ("((^|>)|" + htmlizedIgnore + "+)" + misdetectedCodePageSequence + "(" + htmlizedIgnore  + "($|<))");
  if (matchInText(element, normalExpression, htmlizedExpression)) {
    if (!canBeAssumedRTL(element))
    return true;
  }
  return false;
}

function canBeAssumedRTL(element)
{
  // we check whether there exists a line which either begins
  // with a word consisting solely of characters of an RTL script,
  // or ends with two such words (excluding any punctuation/spacing/
  // numbering at the beginnings and ends of lines)

  // we use definitions from nsBiDiUtils.h as the criteria for BiDi text;
  // cf. the macros IS_IN_BMP_RTL_BLOCK and IS_RTL_PRESENTATION_FORM

  var rtlSequence = "([\\u0590-\\u08FF]|[\\uFB1D-\\uFDFF]|[\\uFE70-\\uFEFC])+";
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
  try {
    var iterator = new XPathEvaluator();
    var path = iterator.evaluate("descendant-or-self::text()", element, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    for (var node = path.iterateNext(); node; node = path.iterateNext())
    {
      if (normalExpression.test(node.data))
        return true;
    }
  } catch(ex) {
    // 'new XPathEvaluator()' doesn't work for some reason, so we have
    // to test the HTMLized message rather than the bare text lines;
    // the regexp must change accordingly
    
    if (htmlizedExpression.test(element.innerHTML))
      return true;
  }
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