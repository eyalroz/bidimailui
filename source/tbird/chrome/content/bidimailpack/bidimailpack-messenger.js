function SetMessageDirection(dir) {
  var brwsr = getMessageBrowser();
  if (!brwsr) return;
  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  body.setAttribute('dir', dir);
  // TB only
  UpdateDirectionBroadcasters(dir);
}

function SwitchMessageDirection() {
  var brwsr = getMessageBrowser();
  if (!brwsr) return;
  var body = brwsr.docShell.contentViewer.DOMDocument.body;
  var currentDir = window.getComputedStyle(body, null).direction;

  if (currentDir == 'rtl')
    body.setAttribute('dir', 'ltr');
  else
    body.setAttribute('dir', 'rtl');

  // TB only
  UpdateDirectionBroadcasters(dir);
}

// TB only - update optional direction buttons status
function UpdateDirectionBroadcasters(var direction) {
  var caster = document.getElementById("ltr-document-direction-broadcaster");
  caster.setAttribute("checked", direction == "ltr");
  caster = document.getElementById("rtl-document-direction-broadcaster");
  caster.setAttribute("checked", direction == "rtl");
}

function browserOnLoadHandler() {
  var body = this.docShell.contentViewer.DOMDocument.body;
  var bodyIsPlainText = body.childNodes.length > 1
    && body.childNodes[1].className != 'moz-text-html'; // either '*-plain' or '*-flowed'

  // reply css
  if (!bodyIsPlainText) {
    var newSS;
    newSS = this.docShell.contentViewer.DOMDocument.createElement("link");
    newSS.rel  = "stylesheet";
    newSS.type = "text/css";
    newSS.href = "chrome://bidimailpack/content/reply.css";
    head = this.docShell.contentViewer.DOMDocument.getElementsByTagName("head")[0];
    if (head)
      head.appendChild(newSS);
  }

  // Auto detect plain text direction
  var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  try {
    if (!prefs.getBoolPref("mailnews.message_display.autodetect_direction"))
      return;
  } catch(e) { } // preference is not set.  
  
  // at this point, either the preference specifies autodetection or there
  // is no preference, and autodetection is the default behavior

  // TODO: consider changing the following condition so as to also set the
  // direction of non-plain-text HTML messages without a preset direction
         
  if (bodyIsPlainText && hasRTLWord(body))
    SetMessageDirection('rtl');
}

function InstallBrowserHandler() {
  getMessageBrowser().addEventListener('load', browserOnLoadHandler, true);
}
