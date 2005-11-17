function initValues()
{
  // Default composing direction for a new message. Default: LTR.
  document.getElementById("bidimailpack-default-dir").value =
    gBDMPrefs.getCharPref("compose.default_direction", "ltr").toLowerCase();

  // Reply direction options: 
  //   - same direction as the orginal message, or
  //   - force default direction
  // Default: same direction as the original message
  document.getElementById("bidimailpack-reply-in-default-dir").checked =
    gBDMPrefs.getBoolPref("compose.reply_in_default_direction", false);

  // Show direction control button when composing a message? Default: True
  document.getElementById("bidimailpack-display-buttons").checked =
    gBDMPrefs.getBoolPref("compose.show_direction_buttons", true);
}

function saveValues()
{
  var element;

  element = document.getElementById("bidimailpack-default-dir");
  gBDMPrefs.setCharPref("compose.default_direction", element.value);

  element = document.getElementById("bidimailpack-reply-in-default-dir");
  gBDMPrefs.setBoolPref("compose.reply_in_default_direction", element.checked);

  element = document.getElementById("bidimailpack-display-buttons");
  gBDMPrefs.setBoolPref("compose.show_direction_buttons", element.checked);

  document.getElementById("paragraph_vertical_margin").saveToPrefs();
}

function dialogAccept()
{
  var rv = false;

  if (!document.getElementById("paragraph_vertical_margin").validateData())
    document.getElementById("paragraph_vertical_margin").focus();
  else {
    saveValues();
    rv = true;
  }
  
  return rv;
}
