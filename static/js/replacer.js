CDK_DEPICT_URL = "https://www.simolecule.com/cdkdepict"

ReadyToRock = true;
OpenBabel = OpenBabelModule();
OBMOL = undefined;
OpenBabel.onRuntimeInitialized = function() {
  conv = new OpenBabel.ObConversionWrapper();
  conv.setInFormat('', 'smi');
  conv.setOutFormat('', 'smi');
  OBMOL = new OpenBabel.OBMol();
  ReadyToRock = true;
  console.log("Open Babel is ready");
};

function WaitForOB()
{
  if (ReadyToRock) {
    Initialize();
  }
  else {
    setTimeout(WaitForOB, 200);
  }
}

window
  .initRDKitModule()
  .then(function (RDKit) {
    console.log("RDKit version: " + RDKit.version());
    window.RDKit = RDKit;
    $(function() {
      WaitForOB();
    });
  });

var STATE = Backbone.Model.extend({
  defaults: {
    "mode": "initial",  // Can be "initial", "search", or "replace"
    "searchtype": "rgroups",
    "terminate": false,
    "drawn": null,      // Using null instead of undefined for explicit values
    "smarts": null,
    "replace": null,
    "hovertarget": null
  }
});

window.state = new STATE;
state.on("change", function(model) {
    const changed = model.changed;

    // If mode changed to "search", we need to re-run the search
    if (changed.hasOwnProperty('mode')) {
        if (changed.mode === "search") {
            StartSearch();
        }
        else if (changed.mode === "replace") {
            Replace();
        }
    }
    // Only one property changed - handle specific cases
    if (Object.keys(changed).length === 1) {
        if (changed.hasOwnProperty('drawn') || changed.hasOwnProperty('searchtype')) {
            StartSearch();
        } else if (changed.hasOwnProperty('replace')) {
            Replace();
        } else if (changed.hasOwnProperty('hovertarget')) {
            ShowDetails();
        }
    } else {
        // Multiple properties changed - handle holistically
        if (changed.hasOwnProperty('drawn') || changed.hasOwnProperty('searchtype')) {
            StartSearch();
        }
        if (changed.hasOwnProperty('replace')) {
            Replace();
        }
        if (changed.hasOwnProperty('hovertarget')) {
            ShowDetails();
        }
    }
});

// Start the Web worker
worker = new Worker('static/js/worker.openbabel.js');
worker.onmessage = (e) => {
  /*if (e.data.type != "status") {
    console.log(e.data);
  }*/
  if (!(e.data.searchtype == state.get("searchtype") &&
        e.data.qsmi == state.get("drawn"))) {
    return;
  }
  if (e.data.type == "hit") {
    HandleResult(e.data.smi, e.data.idx);
  }
  else if (e.data.type == "status") {
    if (!e.data.finished && !state.get("terminate")) {
      worker.postMessage({smarts: state.get("smarts"), qsmi: state.get("drawn"), startidx:e.data.idx});
    }
  }
  else if (e.data.type == "smartsok") {
    if (!e.data.message) {
      HandleInvalid();
    } else {
      HandleValid();
    }
  }
}

function CXNSmiles(smi)
{
  var i = 0;
  var result = [];
  var N = smi.length;
  while (i < N) {
    var x = smi[i];
    if ("BCFHINOPSbcnops".indexOf(x) > -1) {
      result.push(";");
    } else if (x == '*') {
      result.push("_AP1;");
    } else if (x == '[') {
      i++;
      if (smi[i+1] == '*') {
        result.push("_AP" + (parseInt(smi[i])+1));
      }
      while (smi[i] != ']') {
        i++;
      }
      result.push(";")
    }
    i += 1;
  } 
  return smi + " |$" + result.join("") + "$|";
}

function HandleValid()
{
  $('#search').removeClass("limbo");
  $('#searchresults').html("");
}

function HandleInvalid()
{
  $('search').addClass("limbo");
}

function TidySmiles(smi)
{
  return smi.replace(/\[R\]/g, "[#0]");
}

var Router = Backbone.Router.extend({
  routes: {
    "search/:searchtype/:smiles/": "search",
    "replace/:searchtype/:molidx": "replace",
    "": "default"
  },

  default: function() {
    document.JME.reset();  // Clear the JSME editor
    state.set({
      mode: "initial",
      searchtype: "rgroups",
      drawn: null,
      replace: null
    });
  },

  search: function(searchtype, smiles) {
    if (TidySmiles(document.JME.smiles()) != smiles) {
      // both [R] and * get converted to R in the MOL file so we need to hack one of them
      var mol = RDKit.get_mol(smiles.replace(/\*/g, "[Xe]"));
      var sdf = mol.get_molblock();
      sdf = sdf.replace(/Xe/g, "*");
      document.JME.readMolFile(sdf);
    }
    $.each($('input[name=btnradio]'), function(index, radio) {
      $(radio).prop("checked", radio.value === searchtype);
    });

    state.set({
      mode: "search",
      searchtype: searchtype,
      drawn: smiles,
      replace: null
    });
  },

  replace: function(searchtype, molidx) {
    $.each($('input[name=btnradio]'), function(index, radio) {
      $(radio).prop("checked", radio.value === searchtype);
    });
    state.set({
      mode: "replace",
      searchtype: searchtype,
      replace: molidx
    });
  }
});

function jsmeOnLoad() {
  // Add behaviour to JSME
  document.JME.setCallBack("AfterStructureModified", function(jsmeEvent) {
    var myjsme = jsmeEvent.src;
    if (myjsme.smiles() !== "") {
      var navigation_url = "search/"+state.get("searchtype")+"/"+encodeURIComponent(TidySmiles(myjsme.smiles()))+"/";
      console.log("Navigating to " + navigation_url);
      app.navigate(navigation_url, {trigger: true});
    }
  });
  $('#JME').mouseenter(function() {$('#jsme_help').show();})
           .mouseleave(function() {$('#jsme_help').hide();});
}

function Initialize()
{
  console.log("READY!!!");
  $('#replacer').hide();
  $('input[name="btnradio"]').on('change', function() {
    var searchtype = $(this).val();
    state.set("searchtype", searchtype);

    var currentSmiles = state.get("drawn");
    if (currentSmiles != "" && currentSmiles != null) {
      app.navigate("search/" + searchtype + "/" + encodeURIComponent(currentSmiles) + "/", {trigger: true});
    }
  });
  app = new Router();
  Backbone.history.start();
}

function HandleResult(smi, molidx)
{
  $('#help').hide();
  var png_section = document.getElementById("searchresults");
  var children = png_section.children;
  if (children.length > 30) {
    // Let's just stop if there are quite a few hits
    //  - CDK Depict might not be too happy otherwise
    state.set("terminate", true);
  }
  else {
    var elem = $('<a href="#replace/' + state.get("searchtype") + '/' + molidx + '" ><img data-molidx="' + molidx + '" src="' + CDK_DEPICT_URL+ '/depict/cow/svg?abbr=off&hdisp=provided&disp=bridgehead&annotate=colmap&showtitle=true&smi=' + encodeURIComponent(CXNSmiles(smi)) + '" /></a>\n')[0];
    png_section.appendChild(elem);
  }
}

function StartSearch()
{
  var smiles = state.get("drawn");
  if (smiles === null || smiles === "") {
    $('#search').addClass("limbo");
    $('#replace').addClass("limbo");
    return;
  }

  $('#replacer').hide();

  // Round-trip thru OB to use OB's aromaticity model, which will be needed when matching.
  // e.g. O=c1ccc1=O will be converted to O=C1C=CC1=O, as otherwise won't match
  // Note that we need to handle R groups, e.g. "C[#0]" - OB won't read this directly
  var ok = conv.readString(OBMOL, smiles.replace(/#0/g, "Xe"));
  var obsmiles = conv.writeString(OBMOL, true);
  var qmol = RDKit.get_qmol(obsmiles.replace(/Xe/g, "#0"));
  var smarts = qmol.get_smarts();
  state.set("smarts", smarts);

  $('#search').show().addClass("limbo");
  state.set("terminate", false);
  worker.postMessage({smarts: smarts, qsmi: smiles, searchtype: state.get("searchtype"), startidx: 0});
}

function Replace()
{
  var molidx = state.get("replace");
  if (molidx === null) {
    $('#replacer').hide();
    return;
  }
  $('#help').hide();
  $('#search').hide();
  $('#replacer').show();

  if (state.get("searchtype") == "rgroups") {
    group_total = rgroups_total;
    freqs = rgroups_freqs;
    idx2smi = rgroups_idx2smi;
    children = rgroups_children;
    parents = rgroups_parents;
  } else {
    group_total = linkers_total;
    freqs = linkers_freqs;
    idx2smi = linkers_idx2smi;
    children = linkers_children;
    parents = linkers_parents;
  }

  var smiles = idx2smi[molidx];
  var freq = freqs[molidx];

  var mhtml = [];
  mhtml.push('<img id="query_img" data-freq="' + freq + '" src="' + CDK_DEPICT_URL + '/depict/cow/svg?abbr=off&hdisp=provided&disp=bridgehead&showtitle=true&smi=' + encodeURIComponent(CXNSmiles(smiles)) + '" />\n');
  mhtml.push('<br/>');
  mhtml.push('<span class="details frequency">' + freq + '</span>');
  $('#query_div').html(mhtml.join(''));
  for (var i=0; i<2; i++) {
    var section = (i==0) ? "before" : "after";
    var graph = (i==0) ? children : parents;
    var relatives = graph[molidx];
    var mydiv = (i==0) ? $('#before_imgs') : $('#after_imgs');
    var mhtml = [];
    if (relatives !== null) {
      for (var j=0; j<relatives.length; j+=2) {
        var relmolidx = relatives[j];
        // Normalise to the 0 permutation for everything except the depiction
        var relmolidx_0 = (relmolidx > group_total) ? relmolidx - group_total : relmolidx;
        var relco = relatives[j+1];
        var relfreq = freqs[relmolidx_0];
        var img_id = section + "_" + relmolidx;
        mhtml.push('<div>\n');
        mhtml.push('<a href="#replace/' + state.get("searchtype") + '/' + relmolidx_0 + '"><img id="' + img_id + '" data-freq="' + relfreq + '" data-co="' + relco + '" src="' + CDK_DEPICT_URL + '/depict/cow/svg?abbr=off&hdisp=provided&disp=bridgehead&showtitle=true&smi=' + encodeURIComponent(CXNSmiles(idx2smi[relmolidx])) + '" /></a>\n');
        mhtml.push('<br/>');
        mhtml.push('<span class="details">' + (j/2+1) + '.&nbsp;');
        mhtml.push('<span class="co-occurrence">' + relco + '</span>/<span class="frequency">'+ relfreq + '</span>');
        mhtml.push('</span>');
        mhtml.push('</div>\n');
      }
    }
    mydiv.html(mhtml.join(''));
  }
  $('#dv_before').removeClass("limbo");
  $('#dv_after').removeClass("limbo");
  $('img').mouseenter(HandleImgHover).mouseleave(HandleImgNoHover);
  var mids = ['#before', '#after', '#title'];
  for (var i=0; i<mids.length; i++) {
    $(mids[i]).mouseenter(HandleImgHover).mouseleave(HandleImgNoHover);
  }
}

function HandleImgHover()
{
  state.set("hovertarget", $(this).attr('id'));
}

function HandleImgNoHover()
{
  state.set("hovertarget", null);
}

function ShowDetails()
{
  var targetid = state.get("hovertarget");
  if (targetid === null) {
    $('#helptext').html("");
    return;
  }

  if (targetid == 'title') {
    var text = ['Shown are those R groups that tend to be made around the same time as the query R group, divided into those that tend to be made before, versus those that tend to be made after.<br>This information is inferred from chemical structures text-mined from ChEMBL. It is based on co-occurrence information in matched series, rather than true project time-series data. To avoid over-counting, we only include a particular R group once per document.'];
    text.push('<b>Key:</b><br><span class="frequency">Frequency in a matched series</span><br><span class="co-occurrence">Co-occurrence with the query</span>');
    $('#helptext').html(text.join('<br>'));
    return;
  }
  if (targetid == "after") {
    $('#helptext').html('These R groups occur less frequently than the query and hence we infer that they are likely to be made <i>after</i> the query (if at all). They are ordered by co-occurrence with the query. Only the top 12 are shown.');
    return;
  }
  if (targetid == "before") {
    $('#helptext').html('These R groups occur more frequently than the query and hence we infer that they are likely to be made <i>before</i> the query (if at all). They are ordered by co-occurrence with the query divided by frequency. Only the top 12 are shown.');
    return;
  }
  var parts = targetid.split('_');
  var img = $('#' + targetid);
  if (parts[0] == "query") {
    $('#helptext').html('The query group occurs as part of a matched series in ' + img.attr("data-freq") + ' documents.');
    return;
  } else if (parts[0] == "after" || parts[0] == "before") {
    $('#helptext').html('This group occurs as part of a matched series in ' + img.attr("data-freq") + ' documents. In ' + img.attr("data-co") + ' of those, it co-occurs with the query.');
    return;
  }
}
