import json
import itertools
import collections
from rdkit import Chem, RDLogger
RDLogger.DisableLog('rdApp.*') 

# Not all SMILES can be read by RDKit so we need to renumber things

RGROUP, LINKER = range(2)
FREQS, GRAPH = range(2)

def ReadGraph(fname, newindices):
    # We return the original indices, but use the 'newindices' for filtering
    children = collections.defaultdict(set)
    parents = collections.defaultdict(set)
    with open(fname) as inp:
        miter = iter(inp)
        line = next(miter)
        while line.startswith("#"):
            line = next(miter)
        N = int(line)
        for line in miter:
            broken = line.rstrip().split()
            srcidx = int(broken[0])
            if not srcidx in newindices:
                continue
            co = int(broken[2])
            dstidx, permute = tuple([int(x) for x in broken[1].split("_")])
            if dstidx not in newindices:
                continue
            children[srcidx].add( ((dstidx, permute), co) )
            if permute == 0:
                parents[dstidx].add( ((srcidx, 0), co) )
            else: # invert the src instead
                parents[dstidx].add( ((srcidx, 1), co) )
    return dict(children), dict(parents)

def ReadFreqs(fname, only_include=None):
    """only_include uses original indices"""
    # R Group lookup
    lookup = {}
    originalidx_to_idx = {}
    freqs = [] # indexed by newidx
    reorder = [] # we want to reorder by (num atoms, freq)
    with open(fname) as inp:
        for idx, line in enumerate(inp):
            if only_include is not None and idx not in only_include:
                continue
            broken = line.rstrip().split()
            mol = Chem.MolFromSmiles(broken[1])
            if mol:
                newidx = len(freqs)
                originalidx_to_idx[idx] = newidx
                freq = int(broken[0])
                freqs.append(freq)
                for j, permute in enumerate(broken[1:]):
                    lookup[permute] = (newidx, j)
                reorder.append( (mol.GetNumAtoms(), -freq, newidx) )

    return originalidx_to_idx, freqs, lookup, reorder

if __name__ == "__main__":
    FULL_DATASET = False
    NUM_NBRS = 10000000 if FULL_DATASET else 12

    chembl_folder = "chembl_35"

    data_legacy = {
            RGROUP: [
                "../nbu/SubstitutionGraph/nbu/receipe_4/rgroups.freq", 
                "../nbu/SubstitutionGraph/nbu/receipe_4/graph.1.txt"
                ],
            LINKER: [
                "../nbu/SubstitutionGraph/nbu/receipe_4/rgroups_scafdc.freq", 
                "../nbu/SubstitutionGraph/nbu/receipe_4/graph.1.scafdbl.txt"
                ]
            }
    data_chembl = {
            RGROUP: [
                f"../chembl_data/nbu/{chembl_folder}/rgroups.freq",
                f"../chembl_data/nbu/{chembl_folder}/graph.txt"
                ],
            LINKER: [
                f"../chembl_data/nbu/{chembl_folder}/rgroups_scafdc.freq",
                f"../chembl_data/nbu/{chembl_folder}/graph_scafdc.txt"
                ]
            }
    
    DATA = data_chembl

    for grouptype in range(2):
        # Read freqs and build up the list of SMILES
        originalidx_to_idx, freqs, lookup, _ = ReadFreqs(DATA[grouptype][FREQS])

        # Read graph - skipping those entries unreadable by RDKit
        children, parents = ReadGraph(DATA[grouptype][GRAPH], originalidx_to_idx.keys())

        # Trim graph to just the nearest NUM_NBRS
        # Stick to the original indices (we will renumber below, once we have done the
        # second ReadFreqs) but note that freqs uses the new indices
        seen = set()
        nparents = {}
        for k, v in parents.items():
            nparents[k] = sorted(v, key=lambda x:(x[1], freqs[originalidx_to_idx[x[0][0]]]), reverse=True)[:NUM_NBRS]
            if nparents[k]:
                seen.add(k)
                seen.update([x[0][0] for x in nparents[k]])
        # It can happen that the same group appears both as parent + child.
        # Considering the common case of the reverse permutation of a linker, it's
        # preferable that it only appears in the "After" side and so we exclude any that are
        # already in nparents[k].
        nchildren = {}
        for k, v in children.items():
            after = set(nparents.get(k, []))
            nchildren[k] = sorted((z for z in v if z not in after), key=lambda x:x[1]/freqs[originalidx_to_idx[x[0][0]]], reverse=True)[:NUM_NBRS]
            if nchildren[k]:
                seen.add(k)
                seen.update([x[0][0] for x in nchildren[k]])

        # Read freqs/SMILES a second time, but exclude groups not of interest to save memory
        originalidx_to_idx, freqs, lookup, reorder = ReadFreqs(DATA[grouptype][FREQS], only_include=seen)

        # Renumber so that the indices are in (num atoms, freq) order
        reorder.sort()
        idx2finalidx = {}
        for finalidx, (_, _, newidx) in enumerate(reorder):
            idx2finalidx[newidx] = finalidx
        # Now renumber lookup, freqs, originalidx_to_finalidx, children and parents
        nlookup = {}
        for smi, (newidx, j) in lookup.items():
            nlookup[smi] = (idx2finalidx[newidx], j)
        nfreqs = [None]*len(freqs)
        for i, freq in enumerate(freqs):
            nfreqs[idx2finalidx[i]] = freq
        assert None not in nfreqs
        originalidx_to_finalidx = {}
        for originalidx, idx in originalidx_to_idx.items():
            originalidx_to_finalidx[originalidx] = idx2finalidx[idx]
        children = {}
        for k, v in nchildren.items():
            children[originalidx_to_finalidx[k]] = [((originalidx_to_finalidx[a],b),c) for ((a,b),c) in v]
        parents = {}
        for k, v in nparents.items():
            parents[originalidx_to_finalidx[k]] = [((originalidx_to_finalidx[a],b),c) for ((a,b),c) in v]

        # Process data to use less memory
        NN = max(x[0] for x in lookup.values())+1

        N = max(children.keys())+1
        nchildren = [None]*N
        for k, v in children.items(): # rather than [[id, co], [id, co],...] just store as [id, co, id, co...]
            nchildren[k] = list(itertools.chain.from_iterable([[a[0] + a[1]*NN, b] for (a, b) in v]))
        N = max(parents.keys())+1
        nparents = [None]*N
        for k, v in parents.items():
            nparents[k] = list(itertools.chain.from_iterable([[a[0] + a[1]*NN, b] for (a, b) in v]))

        maxpermute = max(x[1] for x in lookup.values())
        revlookup = [None] * NN * (maxpermute+1)
        for x, y in nlookup.items():
            mid = y[0] + y[1]*NN
            revlookup[mid] = x

        # Write out information
        group = "rgroups" if grouptype == 0 else "linkers"
        for i in range(5):
            folder = "nbu" if FULL_DATASET else "static/js"
            ofname = f"{folder}/{group}.{i}.js"
            with open(ofname, "w") as out:
                if i == 0:
                    out.write(f"{group}_total = {NN};\n")
                elif i == 1:
                    out.write(f"{group}_freqs = ")
                    json.dump(nfreqs, out, separators=(',',':'))
                    out.write(";\n")
                elif i == 2:
                    out.write(f"{group}_idx2smi = ")
                    json.dump(revlookup, out, separators=(',',':'))
                    out.write(";\n")
                elif i == 3:
                    out.write(f"{group}_children = ")
                    json.dump(nchildren, out, separators=(',',':'))
                    out.write(";\n")
                elif i == 4:
                    out.write(f"{group}_parents = ")
                    json.dump(nparents, out, separators=(',',':'))
                    out.write(";\n")

        if FULL_DATASET: # prepare for release separate to the webapp
            print("""
Now run:
   cat rgroups.*.js | sed 's/null/None/g' > rgroups.py
   cat linkers.*.js | sed 's/null/None/g' > linkers.py
""")
