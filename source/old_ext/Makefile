SUBDIRS = chrome suite
.PHONY: all clean subdirs ${SUBDIRS}

all: subdirs bidiext.xpi

clean:
	rm bidiext.xpi 2>/dev/null; true
	for DIR in ${SUBDIRS}; do \
		${MAKE} -C $$DIR $@; \
	done

subdirs: ${SUBDIRS}

${SUBDIRS}:
	${MAKE} -C $@

bidiext.xpi: subdirs
	rm -rf $@; \
	zip $@ \
		chrome/bidiext.jar \
		suite/bidiext.jar \
		install.rdf \
		install.js
