function get_Frames (frame, documentList) {
    const framesList = frame.frames;
    
    documentList.push(frame.document);
    for(var i = 0; i < framesList.length; i++)
    {
        get_Frames(framesList[i], documentList);
    }

    return documentList;
}

var bidiext = {
	init: function() {
        var menu = document.getElementById('contentAreaContextMenu');
        menu.addEventListener('popupshowing', bidiext.showHideContext, false);
        var menuEdit = document.getElementById('menu_Edit_Popup');
        menuEdit.addEventListener('popupshowing', bidiext.showHideEdit, false);
	},
    showHideContext: function() {
        document.getElementById('context_invertdir').hidden = document.getElementById('context-undo').hidden;
    },
    showHideEdit: function() {
        if (document.commandDispatcher.focusedElement)
        {    
            var whatTag = document.commandDispatcher.focusedElement.tagName;
            if ((whatTag == 'INPUT' || whatTag == 'TEXTAREA') || whatTag == 'html:input') 
            {
                document.getElementById('edit_invertdir').setAttribute("disabled", "false");
                return;
            }
        }       
        document.getElementById('edit_invertdir').setAttribute("disabled", "true");
    },
    invert_textbox_dir: function() {
		var theBox = document.commandDispatcher.focusedElement;
		if (window.getComputedStyle(theBox,'').direction == 'rtl')
		  theBox.dir = 'ltr';
        else
          theBox.dir = 'rtl';
	},
    invert_page_dir: function() {
        const documents = get_Frames(window.content, new Array());
        
        for(var i = 0; i < documents.length; i++)
            if (documents[i].dir == 'rtl')
                documents[i].dir = 'ltr';
            else
                documents[i].dir = 'rtl';
	}
}
window.addEventListener('load', bidiext.init, false); 
