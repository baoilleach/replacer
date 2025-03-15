ReplaceR
========

ReplaceR is a webapp that suggests R group and linker replacements based on observed replacements in the literature (as extracted by ChEMBL).

The URL for the webapp is https://baoilleach.github.io/replacer/. The landing page has a more detailed explanation with links to other resources.

ReplacerR runs entirely in the browser (i.e. there is no backend), except for the depictions which are outsourced to CDK Depict (https://www.simolecule.com/cdkdepict/depict.html).

Run locally
-----------

To run everything locally you need a web server, an instance of CDK Depict and a single line change to the codebase.

1. Start up CDK Depict via Docker. You may need to adapt the following instructions which are for Ubuntu 22.04 (via Tuomo Kallikoski)::

     sudo apt install docker.io
     # add yourself to the docker group in /etc/group
     docker pull simolecule/cdkdepict
     docker run -p 8081:8080 simolecule/cdkdepict

2. Check out the code and update the reference to CDK Depict::

     git clone https://github.com/baoilleach/replacer
     # edit the first line of replacer/static/js/replacer.js
     #    CDK_DEPICT_URL = http://localhost:8080

3. Serve it via a proper webserver (Apache/Nginx) or as follows::
   
     python3 -m http.server 8000
     # visit http://localhost:8000 in your browser
