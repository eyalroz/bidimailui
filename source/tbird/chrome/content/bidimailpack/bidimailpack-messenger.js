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
    document.getElementById('ltr-document-direction-broadcaster').setAttribute('checked',true);
    document.getElementById('rtl-document-direction-broadcaster').setAttribute('checked',false);
  }
  else
  {
    body.setAttribute('dir', 'rtl');
    document.getElementById('ltr-document-direction-broadcaster').setAttribute('checked',false);
    document.getElementById('rtl-document-direction-broadcaster').setAttribute('checked',true);
  }
}

function hasRTLWord(element) {

  // we check whether there exists a full word in the element text
  // consisting solely of characters of an RTL script

  // 0x0591 to 0x05F4 is the range of Hebrew characters (basic letters are 0x05D0 - 0x5EA),
  // 0x060C to 0x06F9 is the range of Arabic characters
  var re = /(^|\s)([\u0591-\u05F4]+|[\u060C-\u06F9]+)($|\s)/;

  try {
    var iterator = new XPathEvaluator();
    var path = iterator.evaluate("//text()", element, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    for (var node = path.iterateNext(); node; node = path.iterateNext())
    {
      if (re.test(node.data))
      return true;
    }
  } catch (e) {
    // 'new XPathEvaluator()' doesn't work in Thunderbird for some reason,
    // so we do:
    if (re.test(element.innerHTML))
      return true;
  }
  return false;
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
         
  if (bodyIsPlainText && hasRTLWord(body))
  {
    dirAlignMessage('rtl');
  }
}

function InstallBrowserHandler() {
  getMessageBrowser().addEventListener('load', browserOnLoadHandler, true);
}
