function initValues()
{

  var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  var element;

  // Auto detect text-plain incomming messages direction. Default: true.
  try {
    element = document.getElementById('bidimailpack-autodetect');
    element.checked = prefs.getBoolPref('mailnews.message_display.autodetect_direction');
  } catch(e) {
    element.checked = true;
  };

  // Default composing direction for a new message. Default: LTR.
  try {
    var prefDir = prefs.getCharPref('mailnews.send_default_direction');
    if ( (prefDir == 'RTL') || (prefDir == 'rtl') )
      document.getElementById('bidimailpack-default-dir').selectedIndex = 1;
    else
      document.getElementById('bidimailpack-default-dir').selectedIndex = 0;
  } catch(e) {
    // the LTR default it is marked selected in the XUL
  };

  // Reply direction options: 
  //   - same direction as the orginal message, or
  //   - force default direction
  // Default: same direction as the original message
  try {
    element = document.getElementById('bidimailpack-reply-in-default-dir');
    element.checked = prefs.getBoolPref('mailnews.reply_in_default_direction');
  } catch(e) {
    element.checked = false;
  };

  // Show direction control button when composing a message? Default: True
  try {
    element = document.getElementById('bidimailpack-display-buttons');
    element.checked = prefs.getBoolPref('mail.compose.show_direction_buttons');
  } catch(e) {
    element.checked = true;
  };
}

function saveValues()
{
    var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

    element = document.getElementById('bidimailpack-autodetect');
    prefs.setBoolPref('mailnews.message_display.autodetect_direction', element.checked);

    element = document.getElementById('bidimailpack-default-dir');
    prefs.setCharPref('mailnews.send_default_direction', element.value);

    element = document.getElementById('bidimailpack-reply-in-default-dir');
    prefs.setBoolPref('mailnews.reply_in_default_direction', element.checked);

    element = document.getElementById('bidimailpack-display-buttons');
    prefs.setBoolPref('mail.compose.show_direction_buttons', element.checked);
    
    document.getElementById('margintop').saveToPrefs();
    document.getElementById('marginbottom').saveToPrefs();
}

function dialogAccept()
{
  var rv = false;

  if (!document.getElementById('margintop').validateData())
    document.getElementById('margintop').focus();
  else if (!document.getElementById('marginbottom').validateData())
    document.getElementById('marginbottom').focus();
  else {
    saveValues();
    rv = true;
  }
  
  return rv;
}
