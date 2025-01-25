import itertools

from rgroups import *
from linkers import *

RGROUP, LINKER = range(2)

def get_relevant_data(grouptype):
    if grouptype == RGROUP:
        return rgroups_total, rgroups_idx2smi, rgroups_freqs, rgroups_parents, rgroups_children
    else:
        return linkers_total, linkers_idx2smi, linkers_freqs, linkers_parents, linkers_children

if __name__ == "__main__":
    # I used Open Babel canonical SMILES to do the lookups.
    # If you are using another toolkit just convert everything
    # ahead-of-time to the canonical SMILES used by that toolkit
    examples = [("*S(=O)(=O)N", RGROUP),
                ("*NS(=O)(=O)[1*]", LINKER)]

    for smi, grouptype in examples:
        group_total, idx2smi, freqs, parents, children = get_relevant_data(grouptype)
        idx = idx2smi.index(smi) # use a dictionary instead to speed this up
        # indices >= group_total refer to the alternate permutation of each linker
        # but the frequencies are only stored once, hence we normalise the index
        norm_idx = idx if idx < group_total else idx - group_total
        freq = freqs[norm_idx]
        print(f"{smi} has id {idx} (normlised to {norm_idx} and occurs {freq} times in matched series in different papers")
        for text, data in [("after", parents), ("before", children)]:
            relatives = []
            for ridx, rco in itertools.batched(data[idx], 2):
                relatives.append( (ridx, rco, idx2smi[ridx]) )
            print(f"  {text}: {len(relatives)} in total; here are the nearest 12:")
            for ridx, rco, rsmi in relatives[:12]:
                norm_ridx = ridx if ridx < group_total else ridx - group_total
                print(f"      {rsmi} ({ridx, norm_ridx}) co-occurs {rco} out of {freqs[norm_ridx]} times ")
