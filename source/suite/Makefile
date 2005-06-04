SUBDIRS = chrome
XPI_FILENAME = bidimailui_suite.xpi
.PHONY: all clean subdirs ${SUBDIRS}

all: subdirs ${XPI_FILENAME}

clean:
	rm ${XPI_FILENAME} 2>/dev/null; true
	for DIR in ${SUBDIRS}; do \
		${MAKE} -C $$DIR $@; \
	done

subdirs: ${SUBDIRS}

${SUBDIRS}:
	${MAKE} -C $@

${XPI_FILENAME}: subdirs
	rm -rf $@; \
	zip $@ \
		chrome/bidimailpack.jar \
		install.js \
        install.rdf
