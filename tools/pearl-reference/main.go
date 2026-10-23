// Public test-vector generator. Run from the pinned official Pearl checkout.
// This program never reads an existing wallet, RPC credentials or browser data.
package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"github.com/pearl-research-labs/pearl/node/btcec/schnorr"
	"github.com/pearl-research-labs/pearl/node/btcutil"
	"github.com/pearl-research-labs/pearl/node/btcutil/hdkeychain"
	"github.com/pearl-research-labs/pearl/node/chaincfg"
	"github.com/pearl-research-labs/pearl/node/txscript"
	"github.com/pearl-research-labs/pearl/xmss"
	"github.com/tyler-smith/go-bip39"
	"golang.org/x/crypto/hkdf"
)

const upstream = "99b95ac5e77450f4deebcc23ec2d30f86a885c26"

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

func derive(seed []byte, net *chaincfg.Params, path ...uint32) *hdkeychain.ExtendedKey {
	key := must(hdkeychain.NewMaster(seed, net))
	for _, step := range path {
		next := must(key.DeriveNonStandard(step))
		key.Zero()
		key = next
	}
	return key
}

func main() {
	revision := must(exec.Command("git", "rev-parse", "HEAD").Output())
	if strings.TrimSpace(string(revision)) != upstream {
		panic("run from the pinned official Pearl checkout")
	}
	// Deliberately public BIP39/hdkeychain fixtures. Never fund these keys.
	seeds := map[string][]byte{
		"bip39-vector-1":   bip39.NewSeed("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", ""),
		"leading-zero-273": make([]byte, 32),
		"leading-zero-399": make([]byte, 32),
	}
	binary.BigEndian.PutUint32(seeds["leading-zero-273"][28:], 273)
	binary.BigEndian.PutUint32(seeds["leading-zero-399"][28:], 399)
	for candidate := uint32(0); candidate < 10000; candidate++ {
		seed := make([]byte, 32)
		binary.BigEndian.PutUint32(seed[28:], candidate)
		key := must(hdkeychain.NewMaster(seed, &chaincfg.MainNetParams))
		privateKey := must(key.ECPrivKey())
		leadingZero := privateKey.Serialize()[0] == 0
		privateKey.Zero()
		key.Zero()
		if leadingZero {
			seeds["master-leading-zero"] = seed
			break
		}
	}
	if seeds["master-leading-zero"] == nil {
		panic("public master leading-zero fixture not found")
	}
	type vector struct {
		SeedID       string `json:"seedId"`
		SeedHex      string `json:"seedHex"`
		Network      string `json:"network"`
		CoinType     uint32 `json:"coinType"`
		Account      uint32 `json:"account"`
		Branch       uint32 `json:"branch"`
		Index        uint32 `json:"index"`
		PrivateKey   string `json:"privateKeyHex"`
		PublicKey    string `json:"publicKeyHex"`
		AccountXpub  string `json:"accountXpub"`
		PlainAddress string `json:"plainAddress"`
		PQPublicKey  string `json:"pqPublicKeyHex,omitempty"`
		PQRoot       string `json:"pqRootHex,omitempty"`
		PQAddress    string `json:"pqAddress,omitempty"`
	}
	var vectors []vector
	for _, net := range []*chaincfg.Params{&chaincfg.MainNetParams, &chaincfg.TestNet2Params} {
		for _, id := range []string{"bip39-vector-1", "leading-zero-273", "leading-zero-399", "master-leading-zero"} {
			seed := seeds[id]
			for _, account := range []uint32{0, 1} {
				acct := derive(seed, net, 86+hdkeychain.HardenedKeyStart, net.HDCoinType+hdkeychain.HardenedKeyStart, account+hdkeychain.HardenedKeyStart)
				xpub := must(acct.Neuter()).String()
				acct.Zero()
				for _, branch := range []uint32{0, 1} {
					for _, index := range []uint32{0, 1} {
						path := []uint32{86 + hdkeychain.HardenedKeyStart, net.HDCoinType + hdkeychain.HardenedKeyStart, account + hdkeychain.HardenedKeyStart, branch, index}
						key := derive(seed, net, path...)
						priv := must(key.ECPrivKey())
						pub := priv.PubKey()
						plain := must(btcutil.NewAddressTaproot(schnorr.SerializePubKey(txscript.ComputeTaprootKeyNoScript(pub)), net))
						v := vector{SeedID: id, SeedHex: hex.EncodeToString(seed), Network: net.Name, CoinType: net.HDCoinType, Account: account, Branch: branch, Index: index, PrivateKey: hex.EncodeToString(priv.Serialize()), PublicKey: hex.EncodeToString(pub.SerializeCompressed()), AccountXpub: xpub, PlainAddress: plain.EncodeAddress()}
						// Include both branches; use official C XMSS for reference commitments.
						if id == "bip39-vector-1" && account == 0 && index == 0 {
							path[0] = 222 + hdkeychain.HardenedKeyStart
							pq := derive(seed, net, path...)
							pqPriv := must(pq.ECPrivKey())
							var privateSeed [xmss.PrivateSeedLen]byte
							var publicSeed [xmss.PublicSeedLen]byte
							h := hkdf.New(sha256.New, pqPriv.Serialize(), nil, []byte("XMSS-SEED-EXPANSION"))
							if _, err := io.ReadFull(h, privateSeed[:]); err != nil {
								panic(err)
							}
							if _, err := io.ReadFull(h, publicSeed[:]); err != nil {
								panic(err)
							}
							pk, sk, err := xmss.Keygen(privateSeed, publicSeed)
							if err != nil {
								panic(err)
							}
							clear(sk[:])
							clear(privateSeed[:])
							clear(publicSeed[:])
							pqPriv.Zero()
							pq.Zero()
							script := must(txscript.NewScriptBuilder().AddData(pk[:]).AddOp(txscript.OP_CHECKXMSSSIG).Script())
							root := txscript.AssembleTaprootScriptTree(txscript.NewBaseTapLeaf(script)).RootNode.TapHash()
							address := must(btcutil.NewAddressTaproot(schnorr.SerializePubKey(txscript.ComputeTaprootOutputKey(pub, root[:])), net))
							v.PQPublicKey = hex.EncodeToString(pk[:])
							v.PQRoot = hex.EncodeToString(root[:])
							v.PQAddress = address.EncodeAddress()
						}
						vectors = append(vectors, v)
						priv.Zero()
						key.Zero()
					}
				}
			}
		}
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	networks := make(map[string]any)
	for _, net := range []*chaincfg.Params{&chaincfg.MainNetParams, &chaincfg.TestNet2Params} {
		networks[net.Name] = map[string]any{
			"name": net.Name, "hrp": net.Bech32HRPSegwit, "coinType": net.HDCoinType,
			"genesisHash": net.GenesisHash.String(),
			"versions":    map[string]uint32{"private": binary.BigEndian.Uint32(net.HDPrivateKeyID[:]), "public": binary.BigEndian.Uint32(net.HDPublicKeyID[:])},
		}
	}
	if err := enc.Encode(struct {
		Upstream string         `json:"upstreamCommit"`
		Notice   string         `json:"notice"`
		Networks map[string]any `json:"networks"`
		Vectors  []vector       `json:"vectors"`
	}{upstream, "PUBLIC TEST KEYS. DO NOT FUND.", networks, vectors}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
