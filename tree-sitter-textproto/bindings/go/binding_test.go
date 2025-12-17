package tree_sitter_textproto_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-textproto"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_textproto.Language())
	if language == nil {
		t.Errorf("Error loading Textproto grammar")
	}
}
