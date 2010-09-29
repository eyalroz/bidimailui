function Startup() {
  BiDiMailUI.PrefPane.init();
}

BiDiMailUI.PrefPane = {
  // TODO: find a more respectable place for the version string
#expand  _extVersion: "__VERSION__",

  get spaceBetweenParagraphsValue()
  {
    return document.getElementById("bidimailpack-space-between-paragraphs-value").value;
  },

  set spaceBetweenParagraphsValue(val)
  {
    document.getElementById("bidimailpack-space-between-paragraphs-value").value = val;
    return val;
  },

  get spaceBetweenParagraphsScale()
  {
    return document.getElementById("bidimailpack-space-between-paragraphs-scale").value;
  },

  set spaceBetweenParagraphsScale(val)
  {
    document.getElementById("bidimailpack-space-between-paragraphs-scale").value = val;
    return val;
  },

  init: function() {
    // Expose the extension version
    var header = top.document.getElementById("header");
    if (header)
      header.setAttribute("description", this._extVersion);

    parent.hPrefWindow
          .registerOKCallbackFunc(BiDiMailUI.PrefPane.saveSpaceBetweenParagraphsPrefs);

    this.spaceBetweenParagraphsValue =
      BiDiMailUI.Prefs.getCharPref("compose.space_between_paragraphs.value");
    this.spaceBetweenParagraphsScale =
      BiDiMailUI.Prefs.getCharPref("compose.space_between_paragraphs.scale");
  },

  onunload: function() {
    // Clean up the header description
    var header = top.document.getElementById("header");
    if (header)
      header.removeAttribute("description");
  },

  saveSpaceBetweenParagraphsPrefs: function() {
    // Save these prefs only if they're valid:
    var newScale = this.PrefPane.spaceBetweenParagraphsScale;
    var newValue;
    if (newScale != "px")
      newValue = parseFloat(BiDiMailUI.PrefPane.spaceBetweenParagraphsValue, 10);
    else
      newValue = parseInt(BiDiMailUI.PrefPane.spaceBetweenParagraphsValue, 10);

    if (!isNaN(newValue)) {
      BiDiMailUI.Prefs.setCharPref("compose.space_between_paragraphs.scale", newScale);
      BiDiMailUI.Prefs.setCharPref("compose.space_between_paragraphs.value", newValue);
    }
  }
};
