function initValues()
{
  var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  var element;

  try {
    element = document.getElementById('bidimailpack-autodetect');
    element.checked = prefs.getBoolPref('mailnews.message_display.autodetect_direction');
  } catch(e) {};
  try {
    element = document.getElementById('bidimailpack-default-dir');
    prefDir = prefs.getCharPref('mailnews.send_default_direction');
    if ( (prefDir == 'rtl') || (prefDir == 'RTL') )
      element.selectedItem = element.childNodes[0];
    else element.selectedItem = element.childNodes[1];
  } catch(e) {};
  try {
    element = document.getElementById('bidimailpack-reply-in-default-dir');
    element.checked = prefs.getBoolPref('mailnews.reply_in_default_direction');
  } catch(e) {};
  try {
    element = document.getElementById('bidimailpack-display-buttons');
    element.checked = prefs.getBoolPref('mail.compose.show_direction_buttons');
  } catch(e) {};
  try {
    element = document.getElementById('bidimailpack-display-message-buttons-for-htmlmail');
    element.checked = prefs.getBoolPref('mail.compose.show_whole_message_direction_buttons_for_htmlmail');
  } catch(e) {};
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
    element = document.getElementById('bidimailpack-display-message-buttons-for-htmlmail');
    prefs.setBoolPref('mail.compose.show_whole_message_direction_buttons_for_htmlmail', element.checked);
}
