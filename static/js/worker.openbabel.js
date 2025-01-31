// Globals
QSMI = undefined;
SEARCHTYPE = undefined;
SMARTS = undefined;
SMARTSOBJ = undefined;

// The following is to allow debugging the script directly included into a test HTML page
IN_WORKER = (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope);
if (IN_WORKER) {
  importScripts('openbabel.js', 'rgroups.0.js', 'linkers.0.js', 'rgroups.2.js', 'linkers.2.js');
}
else {
  postMessage = function(object) {
    if (object.type != "status") {
      console.log("postMessage with:");
      console.log(object);
    }
  }
}

// Initialize OpenBabel
OpenBabel = OpenBabelModule();

// Create a Promise that resolves when OpenBabel is ready
const obReady = new Promise(resolve => {
    OpenBabel.onRuntimeInitialized = function() {
        conv = new OpenBabel.ObConversionWrapper();
        conv.setInFormat('', 'smi');
        mol = new OpenBabel.OBMol();
        console.log("Worker: Open Babel is ready");
        resolve();
    };
});

function HandleMessage(data) {
    obReady.then(() => HandleSmarts(data));
}

onmessage = (e) => {
    HandleMessage(e.data);
};

function HandleSmarts(data)
{
  if (data.startidx == 0) {
    SMARTS = data.smarts;
    console.log("Worker: SMARTS is " + SMARTS);
    QSMI = data.qsmi;
    SEARCHTYPE = data.searchtype;
    SMARTSOBJ = new OpenBabel.OBSmartsPattern();
    var ok = SMARTSOBJ.Init(data.smarts);
    postMessage({type: "smartsok", message: ok, qsmi: QSMI, searchtype: SEARCHTYPE});
    if (!ok) {
      return;
    }
  }
  if (SEARCHTYPE == 'rgroups') {
    var molecules = rgroups_idx2smi;
    var mol_total = rgroups_total;
  } else {
    var molecules = linkers_idx2smi;
    var mol_total = linkers_total;
  }
  for (var idx=data.startidx; idx<mol_total && idx<data.startidx+1000; idx++) {
    var smi = molecules[idx];
    conv.readString(mol, smi);
    matched = SMARTSOBJ.Match(mol, true);
    if (matched) {
        postMessage({type: "hit",
                     smi: smi,
                     qsmi: QSMI,
                     idx: idx,
                     searchtype: SEARCHTYPE});
    }
  }
  if (idx == mol_total) {
    postMessage({type: "status",
                 finished: true,
                 percent: 100,
                 qsmi: QSMI,
                 searchtype: SEARCHTYPE});
  } else {
    postMessage({type: "status",
                 finished: false,
                 percent: idx * 100.0 / mol_total,
                 idx: idx,
                 qsmi: QSMI,
                 searchtype: SEARCHTYPE});
  }
}
