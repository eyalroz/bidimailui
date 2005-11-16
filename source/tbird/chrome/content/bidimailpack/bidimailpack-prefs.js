function initValues()
{
  var element;

  // Default composing direction for a new message. Default: LTR.
  var prefDir = GetCharPrefWithDefault("mailnews.send_default_direction",
                                       "ltr").toLowerCase();
  if (prefDir == "rtl")
    document.getElementById('bidimailpack-default-dir').selectedIndex = 1;
  else
    document.getElementById('bidimailpack-default-dir').selectedIndex = 0;

  // Reply direction options: 
  //   - same direction as the orginal message, or
  //   - force default direction
  // Default: same direction as the original message
  element = document.getElementById("bidimailpack-reply-in-default-dir");
  element.checked = GetBoolPrefWithDefault("mailnews.reply_in_default_direction",
                                           false);

  // Show direction control button when composing a message? Default: True
  element = document.getElementById('bidimailpack-display-buttons');
  element.checked = GetBoolPrefWithDefault("mail.compose.show_direction_buttons",
                                           true);
}

function initPane()
{
  var dialog = document.documentElement;
  dialog.getButton("help").hidden = false;
  initValues();
}

function saveValues()
{
    var element;

    element = document.getElementById('bidimailpack-default-dir');
    gPrefService.setCharPref('mailnews.send_default_direction', element.value);

    element = document.getElementById('bidimailpack-reply-in-default-dir');
    gPrefService.setBoolPref('mailnews.reply_in_default_direction', element.checked);

    element = document.getElementById('bidimailpack-display-buttons');
    gPrefService.setBoolPref('mail.compose.show_direction_buttons', element.checked);
    
    document.getElementById('paragraph_vertical_margin').saveToPrefs();
}

function dialogAccept()
{
  var rv = false;

  if (!document.getElementById('paragraph_vertical_margin').validateData())
    document.getElementById('paragraph_vertical_margin').focus();
  else {
    saveValues();
    rv = true;
  }
  
  return rv;
}

function openURL(aURL)
{
  var uri = Components.classes["@mozilla.org/network/standard-url;1"]
                      .createInstance(Components.interfaces.nsIURI);
  uri.spec = aURL;

  var protocolSvc = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                              .getService(Components.interfaces.nsIExternalProtocolService);
  protocolSvc.loadUrl(uri);
}
