SUBDIRS = chrome
.PHONY: all clean subdirs ${SUBDIRS}

all: subdirs bidiui_tbird.xpi

clean:
	rm bidiui_tbird.xpi 2>/dev/null; true
	for DIR in ${SUBDIRS}; do \
		${MAKE} -C $$DIR $@; \
	done

subdirs: ${SUBDIRS}

${SUBDIRS}:
	${MAKE} -C $@

bidiui_tbird.xpi: subdirs
	rm -rf $@; \
	zip $@ \
		chrome/bidimailpack.jar \
		install.rdf \
