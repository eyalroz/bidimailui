// Summary of differences from tbird version:
//
// none, for now!



function dirAlignMessage(dir) {
  var brwsr = getMessageBrowser();
  if (!brwsr) return;
  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  body.setAttribute('dir', dir);
}

function switchMessageDirectionality() {
  var brwsr = getMessageBrowser();
  if (!brwsr) return;
  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  var currentDir = window.getComputedStyle(body, null).direction;

  if (currentDir == 'rtl')
  {
    body.setAttribute('dir', 'ltr');
  }
  else
  {
    body.setAttribute('dir', 'rtl');
  }
}

function browserOnLoadHandler() {
  var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  try
  {
    if (!prefs.getBoolPref("mailnews.message_display.autodetect_direction"))
      return;
  } catch(e) { } // preference is not set.  
  
  // at this point, either the preference specifies autodetection or there
  // is no preference, and autodetection is the default behavior
  
  var body = this.docShell.contentViewer.DOMDocument.body;
  var bodyIsPlainText = body.childNodes.length > 1
    && body.childNodes[1].className != 'moz-text-html'; // either '*-plain' or '*-flowed'

  // TODO: consider changing the following condition so as to also set the
  // direction of non-plain-text HTML messages without a preset direction
         
  if (bodyIsPlainText && hasRTLWord(body))
  {
    dirAlignMessage('rtl');
  }
  
}

function InstallBrowserHandler() {
  getMessageBrowser().addEventListener('load', browserOnLoadHandler, true);
}
