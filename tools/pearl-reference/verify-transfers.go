// Verify public browser-generated transactions with the pinned official script engine.
// Run this file (not the entire directory) from the official Pearl checkout.
package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/pearl-research-labs/pearl/node/chaincfg/chainhash"
	"github.com/pearl-research-labs/pearl/node/txscript"
	"github.com/pearl-research-labs/pearl/node/wire"
)

type prevout struct {
	Txid      string `json:"txid"`
	Vout      uint32 `json:"vout"`
	ScriptHex string `json:"scriptHex"`
	Amount    string `json:"amountGrains"`
}
type testCase struct {
	Label         string    `json:"label"`
	RawHex        string    `json:"rawHex"`
	Txid          string    `json:"txid"`
	ExpectedValid bool      `json:"expectedValid"`
	Prevouts      []prevout `json:"prevouts"`
}

func verify(c testCase) (string, error) {
	raw, err := hex.DecodeString(c.RawHex)
	if err != nil {
		return "", err
	}
	var tx wire.MsgTx
	if err := tx.Deserialize(bytes.NewReader(raw)); err != nil {
		return "", err
	}
	fetcher := txscript.NewMultiPrevOutFetcher(nil)
	for _, prev := range c.Prevouts {
		hash, err := chainhash.NewHashFromStr(prev.Txid)
		if err != nil {
			return "", err
		}
		script, err := hex.DecodeString(prev.ScriptHex)
		if err != nil {
			return "", err
		}
		value, err := strconv.ParseInt(prev.Amount, 10, 64)
		if err != nil || value <= 0 {
			return "", fmt.Errorf("invalid prevout amount")
		}
		fetcher.AddPrevOut(wire.OutPoint{Hash: *hash, Index: prev.Vout}, &wire.TxOut{Value: value, PkScript: script})
	}
	hashes := txscript.NewTxSigHashes(&tx, fetcher)
	for i, input := range tx.TxIn {
		prev := fetcher.FetchPrevOutput(input.PreviousOutPoint)
		if prev == nil {
			return "", fmt.Errorf("missing prevout")
		}
		engine, err := txscript.NewEngine(prev.PkScript, &tx, i, txscript.StandardVerifyFlags, nil, hashes, prev.Value, fetcher)
		if err != nil {
			return "", err
		}
		if err := engine.Execute(); err != nil {
			return "", err
		}
	}
	return tx.TxHash().String(), nil
}
func main() {
	var cases []testCase
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		panic(err)
	}
	if len(cases) == 0 {
		panic("no reference verification cases")
	}
	results := make([]map[string]any, 0, len(cases))
	for _, c := range cases {
		id, err := verify(c)
		if (err == nil) != c.ExpectedValid {
			panic(fmt.Sprintf("%s: unexpected script result: %v", c.Label, err))
		}
		if c.ExpectedValid && id != c.Txid {
			panic(c.Label + ": browser/native transaction ID mismatch")
		}
		results = append(results, map[string]any{"label": c.Label, "accepted": err == nil, "txid": id})
	}
	if err := json.NewEncoder(os.Stdout).Encode(results); err != nil {
		panic(err)
	}
}
