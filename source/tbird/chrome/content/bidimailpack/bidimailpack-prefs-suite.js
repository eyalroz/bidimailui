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
 * The Original Code is the BiDi Mail UI extension.
 *
 * The Initial Developer of the Original Code is Asaf Romano.
 *
 * Portions created by the Initial Developer are Copyright (C) 2004-2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Asaf Romano <mozilla.mano@sent.com>
 *   Eyal Rozenberg <eyalroz@technion.ac.il>
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
