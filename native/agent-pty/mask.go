package main

import (
	"bytes"
	"io"
	"unicode/utf8"
)

type boundary struct {
	first []byte
	last  []byte
}

func boundaries(values []string) []boundary {
	out := make([]boundary, 0, len(values))
	for _, value := range values {
		raw := []byte(value)
		// Very short values are matched literally. A long recognizable prefix
		// starts a redaction span that can include other interleaved TTY bytes.
		if len(raw) < 28 {
			out = append(out, boundary{first: raw})
			continue
		}
		first, last := 12, len(raw)-12
		for !utf8.RuneStart(raw[first]) {
			first++
		}
		for !utf8.RuneStart(raw[last]) {
			last--
		}
		out = append(out, boundary{first: raw[:first], last: raw[last:]})
	}
	return out
}

func prefixTail(data, key []byte) int {
	for n := min(len(data), len(key)-1); n > 0; n-- {
		if bytes.Equal(data[len(data)-n:], key[:n]) {
			return n
		}
	}
	return 0
}

func maskStream(dst io.Writer, src io.Reader, values []string) error {
	if len(values) == 0 {
		_, err := io.Copy(dst, src)
		return err
	}
	tokens := boundaries(values)
	from := make([]byte, 4096)
	var pending, ending, partialRune []byte
	emit := func(b []byte) error {
		if len(partialRune) > 0 {
			b = append(partialRune, b...)
		}
		end := len(b)
		for start := max(0, end-utf8.UTFMax+1); start < end; start++ {
			if utf8.RuneStart(b[start]) && !utf8.FullRune(b[start:]) {
				end = start
				break
			}
		}
		partialRune = append([]byte(nil), b[end:]...)
		if end == 0 {
			return nil
		}
		n, err := dst.Write(b[:end])
		if err == nil && n != end {
			return io.ErrShortWrite
		}
		return err
	}
	for {
		n, readErr := src.Read(from)
		pending = append(pending, from[:n]...)
		for len(pending) > 0 {
			if len(ending) > 0 {
				if at := bytes.Index(pending, ending); at >= 0 {
					pending = pending[at+len(ending):]
					ending = nil
					continue
				}
				pending = pending[len(pending)-prefixTail(pending, ending):]
				break
			}
			best, keep := -1, 0
			var found boundary
			for _, token := range tokens {
				if at := bytes.Index(pending, token.first); at >= 0 && (best < 0 || at < best || at == best && len(token.first) > len(found.first)) {
					best, found = at, token
				}
				keep = max(keep, prefixTail(pending, token.first))
			}
			if best < 0 {
				if err := emit(pending[:len(pending)-keep]); err != nil {
					return err
				}
				pending = pending[len(pending)-keep:]
				break
			}
			if err := emit(pending[:best]); err != nil {
				return err
			}
			if err := emit([]byte("[REDACTED]")); err != nil {
				return err
			}
			pending = pending[best+len(found.first):]
			ending = found.last
		}
		if readErr != nil {
			if readErr != io.EOF {
				return readErr
			}
			if (len(pending) > 0 || len(partialRune) > 0) && len(ending) == 0 {
				partialRune = nil
				return emit([]byte("[REDACTED]"))
			}
			return nil
		}
	}
}
